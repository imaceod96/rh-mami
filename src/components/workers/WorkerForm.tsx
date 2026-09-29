import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Label } from "@/components/ui/label"
import { toRomanNumeral } from "@/utils/roman-numerals"
import { ciToBirthDate } from "@/utils/ci"
import { CUBA_PROVINCES_FULL, MUNICIPIOS_BY_PROVINCE_FULL } from "@/data/cuba-locations-full"
import { RepresentativeSelect } from "@/components/representatives/RepresentativeSelect"

export interface WorkerPositionOption {
  id: string
  name: string
  code: string
  is_active: boolean
  occupied: boolean
  authorized_quantity: number
  currentAssignments: number
  job: {
    id: string
    name: string
    area: { id: string; name: string } | null
    salary_group: { id: string; salary_scale_id: string; sequence_number: number } | null
  } | null
}

export interface WorkerEditingData {
  id: string
  code: string
  first_name: string
  first_surname: string
  second_surname: string | null
  identification: string
  birth_date: string | null
  gender_id: string | null
  marital_status_id: string | null
  education_level_id: string | null
  specialty: string | null
  skin_color_id: string | null
  address: string | null
  province: string | null
  municipality: string | null
  phone: string | null
  email: string | null
  hire_date: string
  employment_status: string
}

interface SalaryValue {
  amount: number
  currency_code: string
}

interface WorkerFormProps {
  entityId: string
  positions: WorkerPositionOption[]
  applicableScaleId: string | null
  salaryValuesByGroup: Record<string, SalaryValue | null>
  editingWorker?: WorkerEditingData | null
  onSuccess: () => void
  onCancel: () => void
}

interface Catalog {
  id: string
  name: string
}

interface ContractType {
  id: string
  name: string
  code: string
}

interface WorkerFormState {
  first_name: string
  first_surname: string
  second_surname: string
  identification: string
  birth_date: string
  gender_id: string
  marital_status_id: string
  education_level_id: string
  specialty: string
  skin_color_id: string
  address: string
  province: string
  municipality: string
  phone: string
  email: string
  hire_date: string
}

const emptyForm: WorkerFormState = {
  first_name: "",
  first_surname: "",
  second_surname: "",
  identification: "",
  birth_date: "",
  gender_id: "",
  marital_status_id: "",
  education_level_id: "",
  specialty: "",
  skin_color_id: "",
  address: "",
  province: "",
  municipality: "",
  phone: "",
  email: "",
  hire_date: "",
}

const formatSalary = (value: SalaryValue) =>
  `${value.amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} ${value.currency_code}`

export const WorkerForm: React.FC<WorkerFormProps> = ({
  entityId,
  positions,
  applicableScaleId,
  salaryValuesByGroup,
  editingWorker,
  onSuccess,
  onCancel,
}) => {
  const isEditing = !!editingWorker

  const [form, setForm] = React.useState<WorkerFormState>(() =>
    editingWorker
      ? {
          first_name: editingWorker.first_name || "",
          first_surname: editingWorker.first_surname || "",
          second_surname: editingWorker.second_surname || "",
          identification: editingWorker.identification || "",
          birth_date: editingWorker.birth_date || "",
          gender_id: editingWorker.gender_id || "",
          marital_status_id: editingWorker.marital_status_id || "",
          education_level_id: editingWorker.education_level_id || "",
          specialty: editingWorker.specialty || "",
          skin_color_id: editingWorker.skin_color_id || "",
          address: editingWorker.address || "",
          province: editingWorker.province || "",
          municipality: editingWorker.municipality || "",
          phone: editingWorker.phone || "",
          email: editingWorker.email || "",
          hire_date: editingWorker.hire_date || "",
        }
      : emptyForm
  )
  const [positionId, setPositionId] = React.useState<string>("")
  const [genders, setGenders] = React.useState<Catalog[]>([])
  const [maritalStatuses, setMaritalStatuses] = React.useState<Catalog[]>([])
  const [educationLevels, setEducationLevels] = React.useState<Catalog[]>([])
  const [skinColors, setSkinColors] = React.useState<Catalog[]>([])
  const [contractTypes, setContractTypes] = React.useState<ContractType[]>([])
  const [contractTypeId, setContractTypeId] = React.useState<string>("")
  const [contractStartDate, setContractStartDate] = React.useState<string>("")
  const [contractEndDate, setContractEndDate] = React.useState<string>("")
  const [representativeAssignmentId, setRepresentativeAssignmentId] = React.useState<string | null>(
    null
  )
  const [canManageOrganization, setCanManageOrganization] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const load = async () => {
      const [g, m, e, s, ct] = await Promise.all([
        supabase.from("genders").select("id, name").order("name"),
        supabase.from("marital_statuses").select("id, name").order("name"),
        supabase.from("education_levels").select("id, name").order("name"),
        supabase.from("skin_colors").select("id, name").order("name"),
        supabase.from("employment_contract_types").select("id, name, code").eq("is_active", true).order("name"),
      ])
      setGenders((g.data as Catalog[]) || [])
      setMaritalStatuses((m.data as Catalog[]) || [])
      setEducationLevels((e.data as Catalog[]) || [])
      setSkinColors((s.data as Catalog[]) || [])
      setContractTypes((ct.data as ContractType[]) || [])
    }
    load().catch(err => {
      console.error("Error loading catalogs:", err)
      setFormError("No se pudieron cargar los catálogos.")
    })
  }, [])

  React.useEffect(() => {
    if (!entityId) return
    supabase
      .rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "organization.manage",
      })
      .then(({ data }) => setCanManageOrganization(!!data))
  }, [entityId])

  const municipalities = React.useMemo(
    () => (form.province && MUNICIPIOS_BY_PROVINCE_FULL[form.province]) || [],
    [form.province]
  )

  // Solo puestos ACTIVOS con plazas disponibles (currentAssignments < authorized_quantity)
    const vacantPositions = React.useMemo(
      () => positions.filter(p => p.is_active && p.currentAssignments < p.authorized_quantity),
      [positions]
    )

  const selectedPosition = React.useMemo(
    () => positions.find(p => p.id === positionId) || null,
    [positions, positionId]
  )

  const selectedContractType = React.useMemo(
    () => contractTypes.find(t => t.id === contractTypeId) || null,
    [contractTypes, contractTypeId]
  )

  // La lógica contractual se basa en el código estable del catálogo global, no en el texto visible.
  const isDeterminedContract = selectedContractType?.code === "DETERMINADO"

  // Información derivada de solo lectura: Área / Cargo / Grupo / Salario referencia
  const derivedInfo = React.useMemo(() => {
    if (!selectedPosition) return null
    const job = selectedPosition.job
    const group = job?.salary_group

    let salaryLabel: string | null = null
    if (applicableScaleId && group && group.salary_scale_id === applicableScaleId) {
      const value = salaryValuesByGroup[group.id]
      salaryLabel = value ? formatSalary(value) : null
    }

    return {
      areaLabel: job?.area?.name || "N/A",
      jobLabel: job?.name || "N/A",
      groupLabel: group ? `Grupo ${toRomanNumeral(group.sequence_number)}` : "N/A",
      salaryLabel,
    }
  }, [selectedPosition, applicableScaleId, salaryValuesByGroup])

  const setField = (field: keyof WorkerFormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleIdentificationChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").substring(0, 11)
    setForm(prev => {
      const derived = ciToBirthDate(cleaned)
      return { ...prev, identification: cleaned, birth_date: derived || prev.birth_date }
    })
  }

  const handleProvinceChange = (province: string) =>
    setForm(prev => ({ ...prev, province, municipality: "" }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entityId) return

    setFormError(null)

    if (!form.first_name.trim() || !form.first_surname.trim()) {
      setFormError("El nombre y el primer apellido son obligatorios")
      return
    }
    if (!form.identification.trim()) {
      setFormError("El carné de identidad es obligatorio")
      return
    }
    if (!form.hire_date) {
      setFormError("La fecha de incorporación es obligatoria")
      return
    }
    if (!isEditing && !positionId) {
      setFormError("El puesto es obligatorio")
      return
    }
    if (!isEditing && !vacantPositions.some(p => p.id === positionId)) {
          setFormError("El puesto seleccionado ya no tiene plazas disponibles. Selecciona otro puesto.")
          return
        }
    if (!isEditing && !contractTypeId) {
      setFormError("Debes seleccionar un tipo de contrato")
      return
    }
    if (!isEditing && isDeterminedContract && !contractEndDate) {
      setFormError("El contrato por tiempo determinado requiere una fecha de fin")
      return
    }
    const effectiveContractStart = contractStartDate || form.hire_date
    if (
      !isEditing &&
      contractEndDate &&
      effectiveContractStart &&
      contractEndDate <= effectiveContractStart
    ) {
      setFormError("La fecha de fin del contrato debe ser posterior a su inicio")
        return
      }
      if (!isEditing && !representativeAssignmentId) {
        setFormError(
          "No existe ningún representante autorizado configurado para la fecha del contrato."
        )
        return
      }
  
      setSubmitting(true)

    try {
      if (isEditing) {
        // Edición: solo datos personales/laborales. El cambio de puesto será
        // un Movimiento de personal en una fase futura (no se toca aquí).
        const { error: updateError } = await supabase
          .from("workers")
          .update({
            first_name: form.first_name.trim(),
            first_surname: form.first_surname.trim(),
            second_surname: form.second_surname.trim() || null,
            identification: form.identification.trim(),
            birth_date: form.birth_date || null,
            gender_id: form.gender_id || null,
            marital_status_id: form.marital_status_id || null,
            education_level_id: form.education_level_id || null,
            specialty: form.specialty.trim() || null,
            skin_color_id: form.skin_color_id || null,
            address: form.address.trim() || null,
            province: form.province || null,
            municipality: form.municipality || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            hire_date: form.hire_date,
          })
          .eq("id", editingWorker!.id)

        if (updateError) throw updateError
        onSuccess()
      } else {
        const { error: rpcError } = await supabase.rpc("create_worker_with_position", {
          p_entity_id: entityId,
          p_worker: {
            first_name: form.first_name.trim(),
            first_surname: form.first_surname.trim(),
            second_surname: form.second_surname.trim(),
            identification: form.identification.trim(),
            birth_date: form.birth_date,
            gender_id: form.gender_id,
            marital_status_id: form.marital_status_id,
            education_level_id: form.education_level_id,
            specialty: form.specialty.trim(),
            skin_color_id: form.skin_color_id,
            address: form.address.trim(),
            province: form.province,
            municipality: form.municipality,
            phone: form.phone.trim(),
            email: form.email.trim(),
          },
          p_position_id: positionId,
          p_hire_date: form.hire_date,
          p_contract_type_id: contractTypeId || null,
          p_contract_start_date: effectiveContractStart || null,
          p_contract_end_date: isDeterminedContract ? contractEndDate || null : null,
          p_representative_assignment_id: representativeAssignmentId,
        })

        if (rpcError) throw rpcError
        onSuccess()
      }
    } catch (err) {
      console.error("Error saving worker:", err)
      setFormError(err instanceof Error ? err.message : "Error al guardar el trabajador")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>}

      {/* Datos personales */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="worker-name">Nombre *</Label>
          <SiteCorpInput
            id="worker-name"
            value={form.first_name}
            onChange={(e) => setField("first_name", e.target.value)}
            placeholder="Ej.: Juan"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-surname1">Primer apellido *</Label>
          <SiteCorpInput
            id="worker-surname1"
            value={form.first_surname}
            onChange={(e) => setField("first_surname", e.target.value)}
            placeholder="Ej.: Pérez"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-surname2">Segundo apellido</Label>
          <SiteCorpInput
            id="worker-surname2"
            value={form.second_surname}
            onChange={(e) => setField("second_surname", e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="worker-ci">Carné de identidad *</Label>
          <SiteCorpInput
            id="worker-ci"
            value={form.identification}
            onChange={(e) => handleIdentificationChange(e.target.value)}
            placeholder="11 dígitos"
            inputMode="numeric"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-birth">Fecha de nacimiento</Label>
          <SiteCorpInput
            id="worker-birth"
            type="date"
            value={form.birth_date}
            onChange={(e) => setField("birth_date", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Se autocompleta desde el CI.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-gender">Sexo</Label>
          <SiteCorpSelect value={form.gender_id} onValueChange={(v) => setField("gender_id", v)}>
            <option value="">Seleccionar</option>
            {genders.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </SiteCorpSelect>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="worker-marital">Estado civil</Label>
          <SiteCorpSelect value={form.marital_status_id} onValueChange={(v) => setField("marital_status_id", v)}>
            <option value="">Seleccionar</option>
            {maritalStatuses.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </SiteCorpSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-education">Nivel educacional</Label>
          <SiteCorpSelect value={form.education_level_id} onValueChange={(v) => setField("education_level_id", v)}>
            <option value="">Seleccionar</option>
            {educationLevels.map((e2) => (
              <option key={e2.id} value={e2.id}>{e2.name}</option>
            ))}
          </SiteCorpSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-specialty">Especialidad</Label>
          <SiteCorpInput
            id="worker-specialty"
            value={form.specialty}
            onChange={(e) => setField("specialty", e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="worker-skincolor">Color de piel</Label>
        <SiteCorpSelect value={form.skin_color_id} onValueChange={(v) => setField("skin_color_id", v)}>
          <option value="">Seleccionar</option>
          {skinColors.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SiteCorpSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="worker-address">Dirección</Label>
        <SiteCorpInput
          id="worker-address"
          value={form.address}
          onChange={(e) => setField("address", e.target.value)}
          placeholder="Calle, número, etc."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="worker-province">Provincia</Label>
          <SiteCorpSelect value={form.province} onValueChange={handleProvinceChange}>
            <option value="">Seleccionar provincia</option>
            {CUBA_PROVINCES_FULL.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </SiteCorpSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-municipality">Municipio</Label>
          <SiteCorpSelect
            value={form.municipality}
            onValueChange={(v) => setField("municipality", v)}
            disabled={!form.province}
          >
            <option value="">Seleccionar municipio</option>
            {municipalities.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </SiteCorpSelect>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="worker-phone">Teléfono</Label>
          <SiteCorpInput
            id="worker-phone"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-email">Email</Label>
          <SiteCorpInput
            id="worker-email"
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>

      {/* Datos laborales */}
      <div className="border-t border-border pt-4">
        {isEditing ? (
          <SiteCorpAlert type="info">
            El puesto actual de un trabajador no se modifica aquí. Los cambios de puesto se
            realizarán mediante Movimientos de personal en una fase posterior.
          </SiteCorpAlert>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="worker-position">Puesto *</Label>
            <SiteCorpSelect value={positionId} onValueChange={setPositionId}>
              <option value="">Seleccionar puesto vacante</option>
              {vacantPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}){p.job ? ` — ${p.job.name}` : ""}
                </option>
              ))}
            </SiteCorpSelect>
            <p className="text-xs text-muted-foreground">
              Solo puestos activos y vacantes de esta entidad.
            </p>
            {vacantPositions.length === 0 && (
              <p className="text-xs text-sitecorp-danger">
                No hay puestos vacantes disponibles. Configura un puesto antes de añadir un trabajador.
              </p>
            )}
          </div>
        )}

        {derivedInfo && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Información derivada del puesto (solo lectura)
            </p>
            <dl className="grid gap-2 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Área</dt>
                <dd className="text-sm font-medium text-ink">{derivedInfo.areaLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cargo</dt>
                <dd className="text-sm font-medium text-ink">{derivedInfo.jobLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Grupo salarial</dt>
                <dd className="text-sm font-medium text-ink">{derivedInfo.groupLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Salario de referencia</dt>
                <dd className="text-sm font-medium text-ink">
                  {derivedInfo.salaryLabel ? (
                    derivedInfo.salaryLabel
                  ) : (
                    <span className="text-muted-foreground">
                      {applicableScaleId ? "Salario no configurado" : "Sin escala configurada"}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="worker-hire">Fecha de incorporación *</Label>
            <SiteCorpInput
              id="worker-hire"
              type="date"
              value={form.hire_date}
              onChange={(e) => setField("hire_date", e.target.value)}
              required
            />
          </div>
          {isEditing && (
            <div className="space-y-2">
              <Label htmlFor="worker-code">Código</Label>
              <SiteCorpInput id="worker-code" value={editingWorker!.code} disabled />
            </div>
          )}
        </div>

        {/* Datos de contratación */}
        {!isEditing && (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
            <p className="mb-3 text-sm font-medium text-ink">Datos de contratación</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="worker-contract-type">Tipo de contrato *</Label>
                <SiteCorpSelect
                  value={contractTypeId}
                  onValueChange={setContractTypeId}
                >
                  <option value="">Seleccionar tipo</option>
                  {contractTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </SiteCorpSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-contract-start">Inicio del contrato</Label>
                <SiteCorpInput
                  id="worker-contract-start"
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Si se deja vacío, se usa la fecha de incorporación.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-contract-end">
                  Fin del contrato {isDeterminedContract ? "*" : ""}
                </Label>
                <SiteCorpInput
                  id="worker-contract-end"
                  type="date"
                  value={contractEndDate}
                  onChange={(e) => setContractEndDate(e.target.value)}
                  disabled={!isDeterminedContract}
                />
                <p className="text-xs text-muted-foreground">
                  {isDeterminedContract
                    ? "Obligatorio para contratos por tiempo determinado."
                    : "Solo aplica a contratos por tiempo determinado."}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <RepresentativeSelect
                entityId={entityId}
                onDate={contractStartDate || form.hire_date}
                value={representativeAssignmentId}
                onChange={setRepresentativeAssignmentId}
                canManage={canManageOrganization}
              />
            </div>
          </div>
        )}

        {isEditing && (
          <p className="mt-2 text-xs text-muted-foreground">
            El trabajador se crea con estado Activo; los cambios de estado laboral se gestionarán en fases posteriores.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <SiteCorpButton variant="outline" type="button" onClick={onCancel}>
          Cancelar
        </SiteCorpButton>
        <SiteCorpButton type="submit" disabled={submitting}>
          {submitting
            ? "Guardando..."
            : isEditing
              ? "Guardar cambios"
              : "Crear trabajador"}
        </SiteCorpButton>
      </div>
    </form>
  )
}
