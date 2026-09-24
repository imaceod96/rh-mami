import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { useSalary } from "@/contexts/SalaryContext"
import { useAuth } from "@/contexts/AuthContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { toRomanNumeral } from "@/utils/roman-numerals"
import { Scale, Plus, Edit3, Clock, AlertTriangle } from "lucide-react"
import type { SalaryGroupWithCurrent } from "@/contexts/SalaryContext"

interface SalaryGroupRow {
  id: string
  sequence_number: number
  description: string | null
  is_active: boolean
  current_value: { amount: number; currency_code: string; effective_from: string } | null
  roman_numeral: string
}

const EntitySettingsSalary = () => {
  const navigate = useNavigate()
  const { currentEntity } = useCurrentEntity()
  const { fetchEntityEmpresarialScale, fetchScaleWithGroups, addSalaryGroup, addSalaryValue } = useSalary()
  const { isPlatformSuperAdmin } = useAuth()
  const [scale, setScale] = React.useState<any>(null)
  const [groups, setGroups] = React.useState<SalaryGroupRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [showAddGroup, setShowAddGroup] = React.useState(false)
  const [newGroupDesc, setNewGroupDesc] = React.useState("")
  const [showEditValue, setShowEditValue] = React.useState<string | null>(null)
  const [newAmount, setNewAmount] = React.useState("")
  const [newEffectiveFrom, setNewEffectiveFrom] = React.useState("")

  const loadScale = React.useCallback(async () => {
    if (!currentEntity) return
    try {
      setLoading(true)
      setError(null)
      const scaleData = await fetchEntityEmpresarialScale(currentEntity.id)
      if (scaleData) {
        setScale(scaleData)
        const scaleWithGroups = await fetchScaleWithGroups(scaleData.id)
        if (scaleWithGroups) {
          const mappedGroups: SalaryGroupRow[] = scaleWithGroups.groups.map((g) => ({
            id: g.group.id,
            sequence_number: g.group.sequence_number,
            description: g.group.description,
            is_active: g.group.is_active,
            current_value: g.current_value,
            roman_numeral: g.roman_numeral,
          }))
          setGroups(mappedGroups)
        }
      } else {
        setScale(null)
        setGroups([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la escala salarial")
    } finally {
      setLoading(false)
    }
  }, [currentEntity?.id, fetchEntityEmpresarialScale, fetchScaleWithGroups])

  React.useEffect(() => {
    loadScale()
  }, [loadScale])

  const handleAddGroup = async () => {
    if (!scale || !newGroupDesc.trim()) return
    try {
      const newGroup = await addSalaryGroup(scale.id, newGroupDesc.trim())
      if (newGroup) {
        setNewGroupDesc("")
        setShowAddGroup(false)
        await loadScale()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al añadir grupo")
    }
  }

  const handleEditValue = async (groupId: string) => {
    if (!newAmount || !newEffectiveFrom) return
    try {
      const amount = parseFloat(newAmount)
      if (isNaN(amount) || amount <= 0) {
        setError("El monto debe ser un número positivo")
        return
      }
      await addSalaryValue(groupId, amount, "CUP", newEffectiveFrom)
      setShowEditValue(null)
      setNewAmount("")
      setNewEffectiveFrom("")
      await loadScale()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el salario")
    }
  }

  if (!currentEntity) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Cargando entidad..." description="Obteniendo información de la entidad organizativa" />
        <SiteCorpCard title="Cargando"><p className="text-sm text-muted-foreground">Cargando información de la entidad...</p></SiteCorpCard>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Escala salarial"
        description="Gestión de la escala salarial de esta entidad"
      />

      {/* Regimen indicator */}
      <SiteCorpAlert type="info" title={`Régimen: ${currentEntity.regime_id}`}>
        {currentEntity.regime_id === "PRESUPUESTADA" ? (
          <>
            <p className="mb-1">Esta entidad es de régimen PRESUPUESTADA.</p>
            <p>La escala salarial aplicable es la <strong>Escala salarial presupuestada general de SiteCorp</strong>.</p>
            <p className="mt-2">No se permite crear una escala local para entidades presupuestadas.</p>
          </>
        ) : (
          <>
            <p className="mb-1">Esta entidad es de régimen EMPRESARIAL.</p>
            <p>La escala salarial es específica de esta entidad.</p>
          </>
        )}
      </SiteCorpAlert>

      {currentEntity.regime_id === "PRESUPUESTADA" ? (
        /* PRESUPUESTADA: Show link to global scale */
        <SiteCorpCard title="Escala salarial aplicable">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Scale className="h-8 w-8 text-sitecorp-primary" />
              <div>
                <p className="text-sm font-semibold text-ink">Escala salarial presupuestada general de SiteCorp</p>
                <p className="text-xs text-muted-foreground">Esta escala es común para todas las entidades presupuestadas del sistema</p>
              </div>
            </div>
            <SiteCorpButton onClick={() => navigate("/admin/settings/salary-scale")}>
              Ver escala global
            </SiteCorpButton>
          </div>
        </SiteCorpCard>
      ) : (
        /* EMPRESARIAL: Show entity-specific scale */
        <>
          {loading ? (
            <SiteCorpLoading rows={5} />
          ) : error ? (
            <SiteCorpAlert type="danger" title="Error">{error}</SiteCorpAlert>
          ) : !scale ? (
            <SiteCorpCard title="Sin escala salarial">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Esta entidad todavía no tiene configurada una escala salarial.
                </p>
                <SiteCorpButton onClick={() => navigate("/admin/settings/salary-scale")}>
                  Crear escala salarial
                </SiteCorpButton>
              </div>
            </SiteCorpCard>
          ) : (
            <>
              <SiteCorpCard title={`Escala salarial de ${currentEntity.name}`} description={scale.description || "Escala salarial empresarial"}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink">Moneda: {scale.currency_code}</p>
                      <p className="text-xs text-muted-foreground">
                        {groups.filter(g => g.is_active).length} grupo(s) activo(s)
                      </p>
                    </div>
                    {isPlatformSuperAdmin && (
                      <SiteCorpButton onClick={() => setShowAddGroup(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Añadir grupo salarial
                      </SiteCorpButton>
                    )}
                  </div>

                  {/* Add group form */}
                  {showAddGroup && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                      <SiteCorpInput
                        placeholder="Descripción del grupo"
                        value={newGroupDesc}
                        onChange={(e) => setNewGroupDesc(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <SiteCorpButton onClick={handleAddGroup}>Guardar</SiteCorpButton>
                        <SiteCorpButton variant="outline" onClick={() => { setShowAddGroup(false); setNewGroupDesc("") }}>Cancelar</SiteCorpButton>
                      </div>
                    </div>
                  )}

                  {/* Groups table */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-ink">Grupos salariales</h4>
                    {groups.map((group) => (
                      <div key={group.id} className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sitecorp-primary/10">
                            <span className="text-sm font-bold text-sitecorp-primary">{group.roman_numeral}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-ink">
                              Grupo {group.roman_numeral}
                              {group.description && ` — ${group.description}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Secuencia: {group.sequence_number}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {group.current_value ? (
                            <div className="text-right">
                              <p className="text-sm font-medium text-ink">
                                {group.current_value.amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} {group.current_value.currency_code}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Vigente desde: {group.current_value.effective_from}
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Sin valor asignado</span>
                          )}
                          <SiteCorpStatusBadge status={group.is_active ? "success" : "warning"}>
                            {group.is_active ? "Activo" : "Inactivo"}
                          </SiteCorpStatusBadge>
                          {isPlatformSuperAdmin && (
                            <SiteCorpButton
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowEditValue(showEditValue === group.id ? null : group.id)
                                setNewAmount("")
                                setNewEffectiveFrom("")
                              }}
                            >
                              <Edit3 className="mr-1 h-3.5 w-3.5" /> Editar
                            </SiteCorpButton>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Edit value form */}
                  {showEditValue && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-ink">Editar salario del grupo</h4>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">Nuevo salario</label>
                          <SiteCorpInput
                            type="number"
                            placeholder="Monto"
                            value={newAmount}
                            onChange={(e) => setNewAmount(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">Vigente desde</label>
                          <SiteCorpInput
                            type="date"
                            value={newEffectiveFrom}
                            onChange={(e) => setNewEffectiveFrom(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <SiteCorpButton onClick={() => handleEditValue(showEditValue)}>Guardar</SiteCorpButton>
                        <SiteCorpButton variant="outline" onClick={() => setShowEditValue(null)}>Cancelar</SiteCorpButton>
                      </div>
                    </div>
                  )}
                </div>
              </SiteCorpCard>

              {/* Salary history */}
              <SiteCorpCard title="Historial de salarios" description="Valores históricos por grupo">
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.id} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-bold text-sitecorp-primary">{group.roman_numeral}</span>
                        <span className="text-sm text-muted-foreground">Grupo {group.sequence_number}</span>
                      </div>
                      <div className="space-y-1">
                        {group.current_value && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>Actual: {group.current_value.amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} {group.current_value.currency_code} desde {group.current_value.effective_from}</span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Historial completo disponible en la sección de historial global.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </SiteCorpCard>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default EntitySettingsSalary