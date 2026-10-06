import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Download, FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2, XCircle, ClipboardCheck } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useEntityPermissions } from "@/hooks/use-entity-permissions"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button } from "@/components/ui/sitecorp-button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  buildWorkerMigrationTemplate,
  downloadWorkerMigrationTemplate,
  importWorkerMigration,
  mapMigrationRows,
  readWorkerMigrationExcel,
  validateWorkerMigration,
  type MigrationPreviewRow,
  type MigrationRow,
} from "@/lib/worker-migration"

interface BatchHistory {
  batchId: string
  migratedAt: string
  total: number
  linked: number
  pending: number
}

interface ImportSummary {
  created: number
  complete: number
  incomplete: number
  pending: number
}

const EntitySettingsInitialImport = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const { permissions, loading: permissionLoading } = useEntityPermissions(entityId)
  const canManageWorkers = permissions.includes("workers.manage")
  const allowed = permissions.includes("workers.initial_import") || canManageWorkers
  const [file, setFile] = React.useState<File | null>(null)
  const [rows, setRows] = React.useState<MigrationRow[]>([])
  const [preview, setPreview] = React.useState<MigrationPreviewRow[]>([])
  const [history, setHistory] = React.useState<BatchHistory[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [summary, setSummary] = React.useState<ImportSummary | null>(null)

  const loadHistory = React.useCallback(async () => {
    if (!entityId) return
    const { data, error: queryError } = await supabase.from("workers")
      .select("migration_batch_id,migrated_at,employment_status,worker_position_assignments(id,is_current,end_date)")
      .eq("organization_entity_id", entityId)
      .not("migration_batch_id", "is", null)
      .order("migrated_at", { ascending: false })
    if (queryError) throw queryError
    const groups = new Map<string, BatchHistory>()
    for (const worker of data || []) {
      const batchId = worker.migration_batch_id as string
      const group = groups.get(batchId) || {
        batchId,
        migratedAt: worker.migrated_at,
        total: 0,
        linked: 0,
        pending: 0,
      }
      group.total += 1
      const assigned = (worker.worker_position_assignments || []).some((assignment: any) => assignment.is_current && !assignment.end_date)
      if (worker.employment_status === "active" && assigned) group.linked += 1
      else if (worker.employment_status === "active") group.pending += 1
      groups.set(batchId, group)
    }
    setHistory([...groups.values()].slice(0, 20))
  }, [entityId])

  React.useEffect(() => {
    if (!allowed) return
    loadHistory().catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial."))
  }, [allowed, loadHistory])

  const handleDownload = async () => {
    setBusy(true)
    setError("")
    try {
      downloadWorkerMigrationTemplate(await buildWorkerMigrationTemplate())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar la plantilla.")
    } finally {
      setBusy(false)
    }
  }

  // VALIDAR: solo lectura/análisis. No crea Workers, Assignments ni documentos.
  const handleValidate = async () => {
    if (!file || !entityId || !allowed) return
    setBusy(true)
    setError("")
    setNotice("")
    setSummary(null)
    try {
      const parsed = await readWorkerMigrationExcel(file)
      const mapped = await mapMigrationRows(parsed)
      const checked = await validateWorkerMigration(entityId, mapped)
      setRows(mapped)
      setPreview(checked)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo validar el archivo.")
      setRows([])
      setPreview([])
    } finally {
      setBusy(false)
    }
  }

  const validCount = preview.filter((row) => row.status === "VALID").length
  const warningCount = preview.filter((row) => row.status === "WARNING").length
  const errorCount = preview.filter((row) => row.status === "ERROR").length
  const canImport = preview.length > 0 && errorCount === 0 && !busy
  const incompleteCount = warningCount

  // INICIAR CARGA: crea Workers reales. Nunca crea Assignments ni documentos.
  const handleImport = async () => {
    if (!entityId || !allowed || !canImport) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const importRows = rows.map((row) => ({ ...row, position_id: undefined, position_code: "" }))
      const result = await importWorkerMigration(entityId, importRows, `MIG-${crypto.randomUUID()}`)
      setSummary({
        created: result.imported,
        complete: result.imported - incompleteCount,
        incomplete: incompleteCount,
        pending: result.imported,
      })
      setConfirmOpen(false)
      setFile(null)
      setRows([])
      setPreview([])
      await loadHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "El backend no pudo completar la carga.")
    } finally {
      setBusy(false)
    }
  }

  if (permissionLoading) return <div className="p-6">Cargando permisos…</div>
  if (!allowed) return <div className="space-y-5 p-6"><SiteCorpPageHeader title="Carga inicial de trabajadores" /><SiteCorpAlert type="warning">No tiene el permiso workers.initial_import ni workers.manage.</SiteCorpAlert></div>

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SiteCorpPageHeader title="Carga inicial de trabajadores" description="Incorpora trabajadores existentes como Workers. La carga inicial crea solo personas: los trabajadores quedan pendientes de vinculación a plantilla." />
      {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}
      {notice && <SiteCorpAlert type="success">{notice}</SiteCorpAlert>}

      {summary && (
        <SiteCorpCard className="rounded-2xl border-emerald-200 bg-emerald-50/60">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-emerald-900">Carga completada</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-emerald-900 sm:grid-cols-4">
                <div><dt className="text-emerald-700">Trabajadores creados</dt><dd className="text-xl font-semibold">{summary.created}</dd></div>
                <div><dt className="text-emerald-700">Con información completa</dt><dd className="text-xl font-semibold">{summary.complete}</dd></div>
                <div><dt className="text-emerald-700">Con información pendiente</dt><dd className="text-xl font-semibold">{summary.incomplete}</dd></div>
                <div><dt className="text-emerald-700">Pendientes de vinculación</dt><dd className="text-xl font-semibold">{summary.pending}</dd></div>
              </dl>
            </div>
            <Button onClick={() => navigate(`/entity/${entityId}/staffing`)}>Ir a Trabajadores</Button>
          </div>
        </SiteCorpCard>
      )}

      <SiteCorpCard className="rounded-2xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl bg-sky-50 p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sky-800"><FileSpreadsheet className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold text-slate-900">1. Descarga la plantilla</h2>
            <p className="mt-1 text-sm text-slate-700">Plantilla simplificada. La fecha de nacimiento no se solicita: se deriva de la identificación cuando es posible.</p>
            {allowed && <Button className="mt-4" onClick={handleDownload} disabled={busy}><Download className="mr-2 h-4 w-4" />Descargar plantilla Excel</Button>}
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Upload className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold text-slate-900">2. Cargar y validar archivo</h2>
            <p className="mt-1 text-sm text-slate-600">Archivo .xlsx, máximo 10 MB. Validar solo analiza el archivo: no crea trabajadores.</p>
            <div className="mt-4 space-y-2">
              <Label htmlFor="initial-import-file">Archivo Excel</Label>
              <SiteCorpInput id="initial-import-file" type="file" accept=".xlsx" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview([]); setRows([]); setError(""); setSummary(null) }} />
              {file && <p className="text-sm font-medium text-slate-700">{file.name}</p>}
            </div>
            {allowed && <Button variant="outline" className="mt-4" onClick={handleValidate} disabled={!file || busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Validar
            </Button>}
          </div>
        </div>
      </SiteCorpCard>

      {preview.length > 0 && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="Total" value={preview.length} tone="neutral" />
          <Summary label="Válidos" value={validCount} tone="valid" />
          <Summary label="Advertencias" value={warningCount} tone="warning" />
          <Summary label="Errores" value={errorCount} tone="error" />
        </div>
        <SiteCorpCard className="rounded-2xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Preview de importación</h2>
              <p className="text-sm text-slate-600">Validar no modifica datos. Iniciar carga crea los trabajadores reales (sin vinculación a puestos).</p>
            </div>
            <Button onClick={() => setConfirmOpen(true)} disabled={!canImport}>
              <ClipboardCheck className="mr-2 h-4 w-4" />{busy ? "Procesando…" : "Iniciar carga"}
            </Button>
          </div>
          {errorCount > 0
            ? <SiteCorpAlert type="danger">Corrige los errores antes de iniciar la carga. El lote no se ejecutará.</SiteCorpAlert>
            : <SiteCorpAlert type="info">Se crearán {preview.length} trabajadores. Quedarán pendientes de vinculación a plantilla.</SiteCorpAlert>}
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Identificación</TableHead><TableHead>Trabajador</TableHead><TableHead>Nacimiento</TableHead><TableHead>Incorporación</TableHead><TableHead>Estado y detalle</TableHead></TableRow></TableHeader>
              <TableBody>{preview.map((item, index) => {
                const row = rows[index]
                const status = item.status
                return <TableRow key={index}>
                  <TableCell>{index + 2}</TableCell>
                  <TableCell className="font-mono text-xs">{row.identification}</TableCell>
                  <TableCell>{row.first_name} {row.first_surname} {row.second_surname}</TableCell>
                  <TableCell>{row.birth_date || <span className="text-amber-700">Pendiente</span>}</TableCell>
                  <TableCell>{row.employment_start_date}</TableCell>
                  <TableCell><div className="flex min-w-56 items-start gap-2">
                    {status === "VALID" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : status === "WARNING" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />}
                    <div><Badge variant={status === "ERROR" ? "destructive" : "secondary"}>{status === "VALID" ? "VÁLIDO" : status === "WARNING" ? "ADVERTENCIA" : "ERROR"}</Badge><p className="mt-1 text-xs text-slate-700">{item.messages.join(" · ") || "Se creará como pendiente de vinculación a plantilla."}</p></div>
                  </div></TableCell>
                </TableRow>
              })}</TableBody>
            </Table>
          </div>
        </SiteCorpCard>
      </>}

      <SiteCorpCard className="rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Historial de lotes</h2>
        <p className="mb-4 text-sm text-slate-600">Los registros provienen de los Workers creados por cada lote de migración.</p>
        {history.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay lotes importados.</p> : <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Lote</TableHead><TableHead>Total</TableHead><TableHead>Vinculados</TableHead><TableHead>Pendientes</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{history.map((batch) => <TableRow key={batch.batchId}><TableCell>{batch.migratedAt ? new Date(batch.migratedAt).toLocaleString("es-CU") : "—"}</TableCell><TableCell className="font-mono text-xs">{batch.batchId}</TableCell><TableCell>{batch.total}</TableCell><TableCell>{batch.linked}</TableCell><TableCell>{batch.pending}</TableCell><TableCell><Badge variant="secondary">Importado</Badge></TableCell></TableRow>)}</TableBody></Table></div>}
      </SiteCorpCard>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar carga de trabajadores</DialogTitle>
            <DialogDescription>Se crearán {preview.length} trabajadores en SiteCorp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-700">
            <p>Los trabajadores se crearán <strong>sin vinculación a Puestos</strong>.</p>
            {incompleteCount > 0 && <p>{incompleteCount} trabajadores quedarán con información pendiente de completar.</p>}
            <p>Podrás completar sus datos y asignarlos posteriormente desde Trabajadores.</p>
            <p className="font-medium text-slate-900">¿Deseas continuar?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={handleImport} disabled={busy}>{busy ? "Iniciando…" : "Iniciar carga"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "neutral" | "valid" | "warning" | "error" }) {
  const colors = { neutral: "text-slate-900", valid: "text-emerald-800", warning: "text-amber-800", error: "text-red-800" }
  return <div className="rounded-2xl border bg-white p-4"><p className={`text-2xl font-semibold ${colors[tone]}`}>{value}</p><p className="text-sm text-slate-600">{label}</p></div>
}

export default EntitySettingsInitialImport
