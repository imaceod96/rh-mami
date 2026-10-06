import * as React from "react"
import { useParams } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { createMigratedWorker, type MigrationRow } from "@/lib/worker-migration"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { Label } from "@/components/ui/label"
import { SelectItem } from "@/components/ui/select"
import { DrivingLicenseSelector } from "@/components/person/DrivingLicenseSelector"
import type { CatalogOption } from "@/lib/catalogs"
import type { WorkerPositionOption } from "@/components/workers/WorkerForm"

interface Props {
  positions: WorkerPositionOption[]
  onSuccess: (workerId: string, pending: boolean) => void
  onCancel: () => void
}

export function MigratedWorkerDialog({ positions, onSuccess, onCancel }: Props) {
  const { entityId } = useParams<{ entityId: string }>()
  const [catalogs, setCatalogs] = React.useState<Record<string, CatalogOption[]>>({})
  const [licenseCategories, setLicenseCategories] = React.useState<CatalogOption[]>([])
  const [licenseIds, setLicenseIds] = React.useState<string[]>([])
  const [form, setForm] = React.useState({
    identification: "", first_name: "", first_surname: "", second_surname: "", birth_date: "",
    gender_id: "", marital_status_id: "", skin_color_id: "", phone: "", email: "", address: "",
    province: "", municipality: "", employment_start_date: "", education_level_id: "", specialty: "",
    profession_or_trade: "", position_id: "", initial_vacation_balance: "", vacation_cutoff_date: "",
  })
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    Promise.all([
      supabase.from("genders").select("id,name").order("name"),
      supabase.from("marital_statuses").select("id,name").order("name"),
      supabase.from("skin_colors").select("id,name").order("name"),
      supabase.from("education_levels").select("id,name").order("name"),
      supabase.from("driving_license_categories").select("id,name,code").order("name"),
    ]).then(([genders, marital, skins, education, licenses]) => {
      const failed = [genders, marital, skins, education, licenses].find((item) => item.error)
      if (failed?.error) throw failed.error
      setCatalogs({ gender_id: genders.data || [], marital_status_id: marital.data || [], skin_color_id: skins.data || [], education_level_id: education.data || [] })
      setLicenseCategories((licenses.data || []).map((row: any) => ({ id: row.id, name: row.name, code: row.code })))
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "No se cargaron los catálogos."))
  }, [])

  const set = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!entityId) return
    setBusy(true)
    setError("")
    try {
      const row: MigrationRow = {
        ...form,
        driving_license_category_ids: licenseIds,
        position_code: "",
      }
      const balance = form.initial_vacation_balance.trim().replace(/\s/g, "").replace(",", ".")
      if (balance && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(balance)) throw new Error("El saldo inicial de vacaciones no es válido.")
      const result = await createMigratedWorker(entityId, {
        ...row,
        initial_vacation_balance: balance,
        vacation_cutoff_date: form.vacation_cutoff_date,
      })
      onSuccess(result.worker_id, !result.assignment_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo migrar el trabajador.")
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, key: keyof typeof form, type = "text", required = false) => <div className="space-y-1.5" key={key}>
    <Label htmlFor={`migration-${key}`}>{label}{required ? " *" : ""}</Label>
    <SiteCorpInput id={`migration-${key}`} type={type} value={form[key]} onChange={(event) => set(key, event.target.value)} required={required} />
  </div>
  const catalog = (label: string, key: "gender_id" | "marital_status_id" | "skin_color_id" | "education_level_id") => <div className="space-y-1.5" key={key}>
    <Label>{label}</Label><SiteCorpSelect value={form[key]} onValueChange={(value) => set(key, value)}><SelectItem value="">Sin especificar</SelectItem>{(catalogs[key] || []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SiteCorpSelect>
  </div>

  return <form className="space-y-5" onSubmit={submit}>
    {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {field("Identificación", "identification", "text", true)}{field("Nombre", "first_name", "text", true)}{field("Primer apellido", "first_surname", "text", true)}
      {field("Segundo apellido", "second_surname")}{field("Fecha de nacimiento", "birth_date", "date")}{catalog("Sexo", "gender_id")}
      {catalog("Estado civil", "marital_status_id")}{catalog("Color de piel", "skin_color_id")}{field("Teléfono", "phone")}
      {field("Correo", "email", "email")}{field("Dirección", "address")}{field("Provincia", "province")}
      {field("Municipio", "municipality")}{field("Fecha de incorporación", "employment_start_date", "date", true)}
      {catalog("Nivel educacional", "education_level_id")}{field("Especialidad", "specialty")}{field("Profesión u oficio", "profession_or_trade")}
    </div>
    <div className="space-y-2"><Label>Licencias de conducción</Label><DrivingLicenseSelector categories={licenseCategories} value={licenseIds} onChange={setLicenseIds} disabled={busy} /></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5"><Label>Puesto (opcional)</Label><SiteCorpSelect value={form.position_id} onValueChange={(value) => set("position_id", value)}><SelectItem value="">Pendiente de vinculación</SelectItem>{positions.filter((position) => position.is_active && position.currentAssignments < position.authorized_quantity).map((position) => <SelectItem key={position.id} value={position.id}>{position.name} ({position.code}) · {position.currentAssignments}/{position.authorized_quantity}</SelectItem>)}</SiteCorpSelect></div>
      {field("Saldo inicial vacaciones (opcional)", "initial_vacation_balance", "text")}{field("Fecha corte vacaciones", "vacation_cutoff_date", "date")}
    </div>
    <p className="text-xs text-slate-600">Sin saldo informado permanece desconocido. La migración no crea contrato ni documentos.</p>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Migrando…" : "Migrar trabajador"}</Button></div>
  </form>
}
