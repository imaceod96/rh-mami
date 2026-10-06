import * as React from "react"
import { useParams } from "react-router-dom"
import { Download, FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
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

const EntitySettingsInitialImport = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const { permissions, loading: permissionLoading } = useEntityPermissions(entityId)
  const allowed = permissions.includes("workers.initial_import") || permissions.includes("workers.manage")
  const [file, setFile] = React.useState<File | null>(null)
  const [rows, setRows] = React.useState<MigrationRow[]>([])
  const [preview, setPreview] = React.useState<MigrationPreviewRow[]>([])
  const [history, setHistory] = React.useState<BatchHistory[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")

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

  const handleValidate = async () => {
    if (!file || !entityId) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const parsed = await readWorkerMigrationExcel(file)
      const mapped = await mapMigrationRows(parsed)
      const checked = await validateWorkerMigration(entityId, mapped)
      setRows(mapped.map((row, index) => ({ ...row, position_id: checked[index]?.position_id || undefined })))
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

  const handleImport = async () => {
    if (!entityId || !canImport) return
    setBusy(true)
    setError("")
    try {
      const result = await importWorkerMigration(entityId, rows, `MIG-${crypto.randomUUID()}`)
      setNotice(`Carga completada: ${result.imported} trabajadores importados.`)
      setFile(null)
      setRows([])
      setPreview([])
      await loadHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "El backend no pudo completar la importación.")
    } finally {
      setBusy(false)
    }
  }

  if (permissionLoading) return <div className="p-6">Cargando permisos…</div>
  if (!allowed) return <div className="space-y-5 p-6"><SiteCorpPageHeader title="Carga inicial de trabajadores" /><SiteCorpAlert type="warning">No tiene el permiso workers.initial_import ni workers.manage.</SiteCorpAlert></div>

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SiteCorpPageHeader title="Carga inicial de trabajadores" description="Incorpora trabajadores existentes como Workers. El puesto es opcional y los casos sin puesto quedan pendientes de vinculación." />
      {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}
      {notice && <SiteCorpAlert type="success">{notice}</SiteCorpAlert>}

      <SiteCorpCard className="rounded-2xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl bg-sky-50 p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sky-800"><FileSpreadsheet className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold text-slate-900">1. Descarga la plantilla</h2>
            <p className="mt-1 text-sm text-slate-700">Incluye las columnas compatibles con los datos actuales, instrucciones y hojas de trabajo para carga inicial.</p>
            <Button className="mt-4" onClick={handleDownload} disabled={busy}><Download className="mr-2 h-4 w-4" />Descargar plantilla Excel</Button>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Upload className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold text-slate-900">2. Cargar archivo Excel</h2>
            <p className="mt-1 text-sm text-slate-600">Archivo .xlsx, máximo 10 MB. La identificación se procesa como texto.</p>
            <div className="mt-4 space-y-2">
              <Label htmlFor="initial-import-file">Archivo Excel</Label>
              <SiteCorpInput id="initial-import-file" type="file" accept=".xlsx" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview([]); setRows([]); setError("") }} />
              {file && <p className="text-sm font-medium text-slate-700">{file.name}</p>}
            </div>
            <Button variant="outline" className="mt-4" onClick={handleValidate} disabled={!file || busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Validar
            </Button>
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
            <div><h2 className="text-lg font-semibold text-slate-900">Preview de importación</h2><p className="text-sm text-slate-600">Cada fila se vuelve a validar en el servidor al confirmar.</p></div>
            <Button onClick={handleImport} disabled={!canImport}>{busy ? "Importando…" : "Confirmar carga"}</Button>
          </div>
          {errorCount > 0 && <SiteCorpAlert type="danger">Hay errores: resuelva todos antes de importar. El lote no se ejecutará.</SiteCorpAlert>}
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Identificación</TableHead><TableHead>Trabajador</TableHead><TableHead>Incorporación</TableHead><TableHead>Puesto</TableHead><TableHead>Estado y detalle</TableHead></TableRow></TableHeader>
              <TableBody>{preview.map((item, index) => {
                const row = rows[index]
                const status = item.status
                return <TableRow key={index}>
                  <TableCell>{index + 2}</TableCell>
                  <TableCell className="font-mono text-xs">{row.identification}</TableCell>
                  <TableCell>{row.first_name} {row.first_surname} {row.second_surname}</TableCell>
                  <TableCell>{row.employment_start_date}</TableCell>
                  <TableCell>{item.position_label || "Pendiente de vinculación"}</TableCell>
                  <TableCell><div className="flex min-w-56 items-start gap-2">
                    {status === "VALID" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : status === "WARNING" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />}
                    <div><Badge variant={status === "ERROR" ? "destructive" : "secondary"}>{status === "VALID" ? "VÁLIDO" : status === "WARNING" ? "ADVERTENCIA" : "ERROR"}</Badge><p className="mt-1 text-xs text-slate-700">{item.messages.join(" · ") || `Se vinculará a ${item.position_label || "el puesto resuelto"}.`}</p></div>
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
    </div>
  )
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "neutral" | "valid" | "warning" | "error" }) {
  const colors = { neutral: "text-slate-900", valid: "text-emerald-800", warning: "text-amber-800", error: "text-red-800" }
  return <div className="rounded-2xl border bg-white p-4"><p className={`text-2xl font-semibold ${colors[tone]}`}>{value}</p><p className="text-sm text-slate-600">{label}</p></div>
}

export default EntitySettingsInitialImport
