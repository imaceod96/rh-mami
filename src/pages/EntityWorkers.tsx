import * as React from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { ArrowLeft, Search, Users, UserCheck, AlertTriangle } from "lucide-react"

/**
 * PERSONAS → TRABAJADORES (§16–§19).
 *
 * Directorio de las personas que ACTUALMENTE pertenecen a la entidad
 * (estado laboral activo). Es independiente de la Plantilla: un trabajador
 * aparece aunque no tenga Puesto/Assignment (p. ej. migrado sin vincular).
 * NO muestra información estructural (Área, Cargo, Puesto, salario, Grupo).
 */

interface WorkerRow {
  id: string
  code: string
  first_name: string
  first_surname: string
  second_surname: string | null
  identification: string
  gender_id: string | null
  phone: string | null
  email: string | null
  birth_date: string | null
  marital_status_id: string | null
  skin_color_id: string | null
  address: string | null
  employment_start_date: string | null
}

const fullName = (w: WorkerRow) =>
  [w.first_name, w.first_surname, w.second_surname].filter(Boolean).join(" ")

const missingFields = (w: WorkerRow): string[] => {
  const fields: string[] = []
  if (!w.birth_date) fields.push("fecha de nacimiento")
  if (!w.gender_id) fields.push("sexo")
  if (!w.marital_status_id) fields.push("estado civil")
  if (!w.skin_color_id) fields.push("color de piel")
  if (!w.address) fields.push("dirección")
  if (!w.employment_start_date) fields.push("fecha de incorporación")
  return fields
}

const EntityWorkers = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const [workers, setWorkers] = React.useState<WorkerRow[]>([])
  const [genderNames, setGenderNames] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")

  const loadData = React.useCallback(async () => {
    if (!entityId) {
      setError("Parámetros de URL no válidos")
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: canView } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "workers.view",
      })
      const { data: canManage } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "workers.manage",
      })
      if (!canView && !canManage) {
        setError("No tiene permiso para ver los trabajadores de esta entidad")
        return
      }

      const { data, error: workersError } = await supabase
        .from("workers")
        .select(
          `id, code, first_name, first_surname, second_surname, identification,
           gender_id, phone, email, birth_date, marital_status_id, skin_color_id,
           address, employment_start_date`
        )
        .eq("organization_entity_id", entityId)
        .eq("employment_status", "active")
        .order("first_surname", { ascending: true })
        .order("first_name", { ascending: true })
      if (workersError) throw workersError
      setWorkers((data as WorkerRow[]) || [])

      const { data: genders } = await supabase.from("genders").select("id, name")
      const map: Record<string, string> = {}
      ;(genders as { id: string; name: string }[] | null)?.forEach((g) => {
        map[g.id] = g.name
      })
      setGenderNames(map)
    } catch (err) {
      console.error("Error loading workers directory:", err)
      setError(err instanceof Error ? err.message : "Error al cargar los trabajadores")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return workers
    return workers.filter((w) =>
      [w.first_name, w.first_surname, w.second_surname, w.identification, w.code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    )
  }, [workers, search])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Trabajadores" description="Cargando personas..." />
        <SiteCorpLoading rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Trabajadores"
          description="Personas que actualmente trabajan en esta entidad."
        />
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton variant="outline" onClick={() => navigate(`/entity/${entityId}/summary`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Trabajadores"
        description="Directorio de las personas que actualmente pertenecen a esta entidad. No depende de la Plantilla ni del Puesto."
      />

      <SiteCorpCard>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <SiteCorpInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, carné de identidad o código..."
                className="pl-9"
              />
            </div>
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {filtered.length} de {workers.length}
            </span>
          </div>

          {workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <h4 className="mb-1 text-base font-semibold text-ink">
                No hay trabajadores activos.
              </h4>
              <p className="text-center text-sm text-muted-foreground">
                Las personas aparecerán aquí al contratarlas o al vincularlas a la entidad, aunque
                todavía no tengan un puesto asignado.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
              <UserCheck className="mb-4 h-12 w-12 text-muted-foreground" />
              <h4 className="mb-1 text-base font-semibold text-ink">Sin resultados</h4>
              <p className="text-sm text-muted-foreground">
                Ninguna persona coincide con la búsqueda.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((w) => {
                const missing = missingFields(w)
                return (
                  <Link
                    key={w.id}
                    to={`/entity/${entityId}/workers/${w.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 transition-colors hover:border-sitecorp-primary/40 hover:bg-sitecorp-primary/5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-ink">{fullName(w)}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {w.code}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        CI: {w.identification}
                      </span>
                      {w.gender_id && genderNames[w.gender_id] && (
                        <span className="text-xs text-muted-foreground">
                          {genderNames[w.gender_id]}
                        </span>
                      )}
                      {w.phone && (
                        <span className="text-xs text-muted-foreground">Tel: {w.phone}</span>
                      )}
                      {w.email && (
                        <span className="text-xs text-muted-foreground">{w.email}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {missing.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sitecorp-warning/40 bg-sitecorp-warning/10 px-2.5 py-0.5 text-xs font-medium text-sitecorp-warning">
                          <AlertTriangle className="h-3 w-3" />
                          Ficha incompleta ({missing.length})
                        </span>
                      ) : (
                        <SiteCorpStatusBadge status="success">Ficha completa</SiteCorpStatusBadge>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </SiteCorpCard>
    </div>
  )
}

export default EntityWorkers
