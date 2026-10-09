import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toRomanNumeral } from "@/utils/roman-numerals"
import { NO_OCCUPATIONAL_CATEGORY_LABEL } from "@/domains/organization-structure"
import { NO_PREPARATION_LEVEL_LABEL } from "@/domains/organization-structure"
import {
  WEEK_DAYS,
  formatTime,
  weekDayLabel,
  type PositionScheduleSegment,
} from "@/domains/organization-structure"
import { CalendarClock, Plus, X } from "lucide-react"

export interface PositionJobOption {
  id: string
  name: string
  code: string
  is_active: boolean
  area_id: string
  area: {
    id: string
    name: string
    code: string
  }
  salary_group: {
    id: string
    salary_scale_id: string
    sequence_number: number
  } | null
  /** Clasificación del cargo: se muestra derivada, nunca se edita en el Puesto. */
  occupational_category: { id: string; name: string } | null
  preparation_levels: { id: string; code: string; name: string }[]
}

export interface PositionEditingData {
  id: string
  job_id: string
  code: string
  name: string
  description: string | null
  authorized_quantity: number
  // Fase 11A.3: información laboral del puesto
  work_location: string | null
  daily_hours: number | null
  weekly_hours: number | null
  monthly_hours: number | null
  break_minutes: number | null
  schedule_notes: string | null
  schedule_segments?: PositionScheduleSegment[]
}

interface PositionFormProps {
  entityId: string
  jobs: PositionJobOption[]
  applicableScaleId: string | null
  salaryValuesByGroup: Record<string, { amount: number; currency_code: string } | null>
  editingPosition?: PositionEditingData | null
  onSuccess: () => void
  onCancel: () => void
}

const MAX_QUANTITY = 9999

// Alfabeto sin caracteres ambiguos (0/O, 1/I) para códigos legibles
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const generatePositionCode = (): string => {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let suffix = ""
  for (let i = 0; i < bytes.length; i++) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return `PST-${suffix}`
}

const formatSalary = (value: { amount: number; currency_code: string }) =>
  `${value.amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} ${value.currency_code}`

/** "08:00:00" | "08:00" → "08:00" (la BD guarda `time`). */
const normalizeTime = (time: string): string => {
  const [hours, minutes] = time.split(":")
  return `${(hours || "00").padStart(2, "0")}:${(minutes || "00").padStart(2, "0")}`
}

const parseNullableNumber = (raw: string): number | null => {
  const trimmed = raw.trim().replace(",", ".")
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : NaN
}

export const PositionForm: React.FC<PositionFormProps> = ({
  entityId,
  jobs,
  applicableScaleId,
  salaryValuesByGroup,
  editingPosition,
  onSuccess,
  onCancel,
}) => {
  const isEditing = !!editingPosition

  const [selectedJobId, setSelectedJobId] = React.useState<string>(
    editingPosition?.job_id || ""
  )
  const [baseName, setBaseName] = React.useState<string>(editingPosition?.name || "")
  const [authorizedQuantity, setAuthorizedQuantity] = React.useState<string>(
    editingPosition?.authorized_quantity?.toString() || "1"
  )
  const [description, setDescription] = React.useState<string>(
    editingPosition?.description || ""
  )
  // Fase 11A.3
  const [workLocation, setWorkLocation] = React.useState<string>(
    editingPosition?.work_location || ""
  )
  const [dailyHours, setDailyHours] = React.useState<string>(
    editingPosition?.daily_hours !== null && editingPosition?.daily_hours !== undefined
      ? String(editingPosition.daily_hours)
      : ""
  )
  const [weeklyHours, setWeeklyHours] = React.useState<string>(
    editingPosition?.weekly_hours !== null && editingPosition?.weekly_hours !== undefined
      ? String(editingPosition.weekly_hours)
      : ""
  )
  const [monthlyHours, setMonthlyHours] = React.useState<string>(
    editingPosition?.monthly_hours !== null && editingPosition?.monthly_hours !== undefined
      ? String(editingPosition.monthly_hours)
      : ""
  )
  const [breakMinutes, setBreakMinutes] = React.useState<string>(
    editingPosition?.break_minutes !== null && editingPosition?.break_minutes !== undefined
      ? String(editingPosition.break_minutes)
      : ""
  )
  const [scheduleNotes, setScheduleNotes] = React.useState<string>(
    editingPosition?.schedule_notes || ""
  )
  const [segments, setSegments] = React.useState<PositionScheduleSegment[]>(
    (editingPosition?.schedule_segments || []).map((segment) => ({
      day_of_week: segment.day_of_week,
      start_time: normalizeTime(segment.start_time),
      end_time: normalizeTime(segment.end_time),
    }))
  )
  const [draftDays, setDraftDays] = React.useState<number[]>([1])
  const [draftStart, setDraftStart] = React.useState<string>("08:00")
  const [draftEnd, setDraftEnd] = React.useState<string>("16:30")
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const activeJobs = React.useMemo(() => jobs.filter(j => j.is_active), [jobs])

  // Opciones del selector: solo cargos activos de esta entidad.
  // Al editar, incluir el cargo actual aunque esté inactivo para que sea visible.
  const jobOptions = React.useMemo(() => {
    if (!isEditing) return activeJobs
    const current = jobs.find(j => j.id === editingPosition!.job_id)
    if (current && !activeJobs.some(j => j.id === current.id)) {
      return [current, ...activeJobs]
    }
    return activeJobs
  }, [jobs, activeJobs, isEditing, editingPosition])

  const selectedJob = React.useMemo(
    () => jobs.find(j => j.id === selectedJobId) || null,
    [jobs, selectedJobId]
  )

  const handleJobChange = (jobId: string) => {
    setSelectedJobId(jobId)
    // Autocompletar el nombre base con el nombre del cargo mientras esté vacío
    // o coincida con el nombre del cargo previamente seleccionado.
    const job = jobs.find(j => j.id === jobId)
    if (job && !isEditing && (!baseName.trim() || jobs.some(j => j.name === baseName.trim()))) {
      setBaseName(job.name)
    }
  }

  // Información derivada de solo lectura: Área / Grupo salarial / Salario actual
  const derivedInfo = React.useMemo(() => {
    if (!selectedJob) return null
    const group = selectedJob.salary_group
    const area = selectedJob.area
    const groupLabel = group ? `Grupo ${toRomanNumeral(group.sequence_number)}` : "N/A"

    let salaryLabel: string | null = null
    if (!applicableScaleId) {
      salaryLabel = null
    } else if (group && group.salary_scale_id === applicableScaleId) {
      const value = salaryValuesByGroup[group.id]
      salaryLabel = value ? formatSalary(value) : null
    }

    const preparationLabel =
      selectedJob.preparation_levels.length > 0
        ? selectedJob.preparation_levels.map((level) => level.code).join(", ")
        : null

    return {
      areaLabel: area ? `${area.name} (${area.code})` : "N/A",
      groupLabel,
      salaryLabel,
      categoryLabel: selectedJob.occupational_category?.name || NO_OCCUPATIONAL_CATEGORY_LABEL,
      preparationLabel,
    }
  }, [selectedJob, applicableScaleId, salaryValuesByGroup])

  const sortedSegments = React.useMemo(
    () =>
      [...segments].sort(
        (a, b) =>
          a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
      ),
    [segments]
  )

  const toggleDraftDay = (day: number) => {
    setDraftDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
  }

  const handleAddSegments = () => {
    setFormError(null)

    if (draftDays.length === 0) {
      setFormError("Selecciona al menos un día para el horario")
      return
    }
    if (!draftStart || !draftEnd) {
      setFormError("Indica la hora desde y hasta del horario")
      return
    }
    if (normalizeTime(draftStart) === normalizeTime(draftEnd)) {
      setFormError("La hora desde y hasta no pueden ser iguales")
      return
    }

    const start = normalizeTime(draftStart)
    const end = normalizeTime(draftEnd)

    setSegments(prev => {
      const next = [...prev]
      draftDays.forEach(day => {
        const duplicated = next.some(
          segment =>
            segment.day_of_week === day &&
            normalized(segment.start_time) === start &&
            normalized(segment.end_time) === end
        )
        if (!duplicated) {
          next.push({ day_of_week: day, start_time: start, end_time: end })
        }
      })
      return next
    })
  }

  const removeSegment = (segment: PositionScheduleSegment) => {
    setSegments(prev =>
      prev.filter(
        item =>
          !(
            item.day_of_week === segment.day_of_week &&
            item.start_time === segment.start_time &&
            item.end_time === segment.end_time
          )
      )
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entityId) return

    setFormError(null)

    const name = baseName.trim()
    if (!selectedJobId) {
      setFormError("El cargo es obligatorio")
      return
    }
    if (!name) {
      setFormError("El nombre del puesto es obligatorio")
      return
    }

    const job = jobs.find(j => j.id === selectedJobId)
    if (!job) {
      setFormError("El cargo seleccionado no es válido")
      return
    }

    const qty = parseInt(authorizedQuantity, 10)
    if (isNaN(qty) || qty < 1) {
      setFormError("La cantidad de puestos debe ser un número entero mayor o igual a 1")
      return
    }
    if (qty > MAX_QUANTITY) {
      setFormError(`La cantidad de puestos no puede superar ${MAX_QUANTITY}`)
      return
    }

    const daily = parseNullableNumber(dailyHours)
    const weekly = parseNullableNumber(weeklyHours)
    const monthly = parseNullableNumber(monthlyHours)
    const breakValue = parseNullableNumber(breakMinutes)

    // Integridad contractual: el lugar de trabajo, la jornada y el horario viven
    // en el PUESTO y son indispensables para formalizar el contrato.
    if (!workLocation.trim()) {
      setFormError("El lugar de trabajo es obligatorio")
      return
    }
    if (
      daily === null || daily <= 0 ||
      weekly === null || weekly <= 0 ||
      monthly === null || monthly <= 0
    ) {
      setFormError(
        "La jornada es obligatoria: indica horas diarias, semanales y mensuales mayores que 0"
      )
      return
    }
    if (breakValue === null) {
      setFormError("El descanso (minutos) es obligatorio")
      return
    }
    if (sortedSegments.length === 0 && !scheduleNotes.trim()) {
      setFormError("El horario es obligatorio: añade segmentos de horario o una descripción")
      return
    }

    // Los valores deben ser >= 0; no se imponen límites legales no definidos
    const hourFields: [string, number | null][] = [
      ["Horas diarias", daily],
      ["Horas semanales", weekly],
      ["Horas mensuales", monthly],
    ]
    for (const [label, value] of hourFields) {
      if (value !== null && (Number.isNaN(value) || value < 0)) {
        setFormError(`${label} debe ser un número mayor o igual a 0`)
        return
      }
    }
    if (breakValue !== null) {
      if (Number.isNaN(breakValue) || breakValue < 0) {
        setFormError("El descanso debe ser un número de minutos mayor o igual a 0")
        return
      }
      if (!Number.isInteger(breakValue)) {
        setFormError("El descanso debe expresarse en minutos enteros")
        return
      }
    }

    setSubmitting(true)

    try {
      const { error: rpcError } = await supabase.rpc("save_position_with_schedule", {
        p_entity_id: entityId,
        p_position_id: isEditing ? editingPosition!.id : null,
        p_job_id: selectedJobId,
        p_code: isEditing ? editingPosition!.code : generatePositionCode(),
        p_name: name,
        p_description: description.trim() || null,
        p_authorized_quantity: qty,
        p_work_location: workLocation.trim() || null,
        p_daily_hours: daily,
        p_weekly_hours: weekly,
        p_monthly_hours: monthly,
        p_break_minutes: breakValue,
        p_schedule_notes: scheduleNotes.trim() || null,
        p_segments: sortedSegments.map((segment, index) => ({
          day_of_week: segment.day_of_week,
          start_time: segment.start_time,
          end_time: segment.end_time,
          display_order: index + 1,
        })),
      })

      if (rpcError) throw rpcError
      onSuccess()
    } catch (err) {
      console.error("Error saving position:", err)
      const message = err instanceof Error ? err.message : "Error al guardar el puesto"
      if (message.includes("organization_positions_entity_code_unique") ||
          message.includes("organization_positions_job_id_code_unique")) {
        setFormError("Conflicto de código, inténtalo de nuevo")
      } else {
        setFormError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {formError && <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>}

      {/* INFORMACIÓN GENERAL */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Información general
        </p>

        <div className="space-y-2">
          <Label htmlFor="position-job">Cargo *</Label>
          <SiteCorpSelect
            value={selectedJobId}
            onValueChange={handleJobChange}
          >
            <option value="">Seleccionar cargo</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name} ({job.code}){!job.is_active ? " — inactivo" : ""}
              </option>
            ))}
          </SiteCorpSelect>
          <p className="text-xs text-muted-foreground">
            Solo cargos activos de esta entidad. El área, el grupo salarial y el contenido de
            trabajo se heredan del cargo.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="position-name">Nombre del puesto *</Label>
            <SiteCorpInput
              id="position-name"
              value={baseName}
              onChange={(e) => setBaseName(e.target.value)}
              placeholder="Ej.: Almacenero"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position-code">Código</Label>
            <SiteCorpInput
              id="position-code"
              value={isEditing ? editingPosition!.code : "Se genera automáticamente"}
              disabled
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="position-description">Descripción</Label>
          <Textarea
            id="position-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción opcional del puesto"
            rows={2}
          />
        </div>
      </div>

      {/* CAPACIDAD */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Capacidad
        </p>
        <div className="space-y-2">
          <Label htmlFor="position-quantity">No. de puestos (cantidad autorizada) *</Label>
          <SiteCorpInput
            id="position-quantity"
            type="number"
            min={1}
            max={MAX_QUANTITY}
            value={authorizedQuantity}
            onChange={(e) => setAuthorizedQuantity(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Número máximo de trabajadores que pueden ocupar este puesto simultáneamente. Es un
            único puesto con N plazas autorizadas; las vacantes se calculan según las asignaciones
            activas.
          </p>
        </div>
      </div>

      {/* UBICACIÓN */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ubicación
        </p>
        <div className="space-y-2">
          <Label htmlFor="position-work-location">Lugar de trabajo *</Label>
          <SiteCorpInput
            id="position-work-location"
            value={workLocation}
            onChange={(e) => setWorkLocation(e.target.value)}
            placeholder="Ej.: Almacén Central"
            required
          />
          <p className="text-xs text-muted-foreground">
            Ubicación habitual donde se ejecuta el trabajo. Es independiente del área
            organizativa del cargo.
          </p>
        </div>
      </div>

      {/* JORNADA */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Jornada
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="position-daily-hours">Horas diarias *</Label>
            <SiteCorpInput
              id="position-daily-hours"
              inputMode="decimal"
              value={dailyHours}
              onChange={(e) => setDailyHours(e.target.value)}
              placeholder="Ej.: 8"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position-weekly-hours">Horas semanales *</Label>
            <SiteCorpInput
              id="position-weekly-hours"
              inputMode="decimal"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              placeholder="Ej.: 44"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position-monthly-hours">Horas mensuales *</Label>
            <SiteCorpInput
              id="position-monthly-hours"
              inputMode="decimal"
              value={monthlyHours}
              onChange={(e) => setMonthlyHours(e.target.value)}
              placeholder="Ej.: 190.6"
              required
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Se almacenan por separado: las horas mensuales no se calculan multiplicando las
          semanales.
        </p>
        <div className="space-y-2 sm:max-w-[240px]">
          <Label htmlFor="position-break">Descanso (minutos) *</Label>
          <SiteCorpInput
            id="position-break"
            inputMode="numeric"
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(e.target.value)}
            placeholder="Ej.: 30"
            required
          />
          <p className="text-xs text-muted-foreground">Se guarda como número de minutos.</p>
        </div>
      </div>

      {/* HORARIO HABITUAL */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Horario habitual
        </p>

        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Selecciona los días y el rango horario; se añadirá a cada día seleccionado.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_DAYS.map((day) => {
              const selected = draftDays.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDraftDay(day.value)}
                  title={day.label}
                  className={cn(
                    "h-8 w-8 rounded-lg border text-xs font-semibold transition-colors",
                    selected
                      ? "border-sitecorp-primary bg-sitecorp-primary text-white"
                      : "border-border bg-white text-muted-foreground hover:bg-muted"
                  )}
                >
                  {day.short}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="schedule-start" className="text-xs">
                Desde
              </Label>
              <SiteCorpInput
                id="schedule-start"
                type="time"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                className="w-[120px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-end" className="text-xs">
                Hasta
              </Label>
              <SiteCorpInput
                id="schedule-end"
                type="time"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="w-[120px]"
              />
            </div>
            <SiteCorpButton type="button" variant="outline" onClick={handleAddSegments}>
              <Plus className="mr-2 h-4 w-4" /> Añadir horario
            </SiteCorpButton>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Si la hora final es anterior a la inicial, se interpreta como turno que cruza
            medianoche (por ejemplo 20:00 → 04:00).
          </p>
        </div>

        {sortedSegments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin configurar: no se ha definido ningún horario para este puesto.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sortedSegments.map((segment) => (
              <li
                key={`${segment.day_of_week}-${segment.start_time}-${segment.end_time}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-ink">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{weekDayLabel(segment.day_of_week)}</span>
                  <span className="text-muted-foreground">
                    {formatTime(segment.start_time)}–{formatTime(segment.end_time)}
                    {segment.end_time < segment.start_time ? " (+1 día)" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeSegment(segment)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-sitecorp-danger"
                  aria-label="Eliminar horario"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <Label htmlFor="position-schedule-notes">Observaciones del horario</Label>
          <Textarea
            id="position-schedule-notes"
            value={scheduleNotes}
            onChange={(e) => setScheduleNotes(e.target.value)}
            placeholder="Ej.: disponibilidad para turnos rotativos"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Sólo para información que no pueda representarse con los segmentos de horario.
          </p>
        </div>
      </div>

      {/* CLASIFICACIÓN Y RETRIBUCIÓN (derivadas del cargo) */}
      {derivedInfo && (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Clasificación y retribución (heredadas del cargo)
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Información derivada del cargo (solo lectura)
              </p>
              <SiteCorpStatusBadge status="info">No editable aquí</SiteCorpStatusBadge>
            </div>
            <dl className="grid gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Categoría Ocupacional</dt>
                <dd className="text-sm font-medium text-ink">{derivedInfo.categoryLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Nivel de preparación</dt>
                <dd className="text-sm font-medium text-ink">
                  {derivedInfo.preparationLabel || NO_PREPARATION_LEVEL_LABEL}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Grupo escala</dt>
                <dd className="text-sm font-medium text-ink">{derivedInfo.groupLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Área</dt>
                <dd className="text-sm font-medium text-ink">{derivedInfo.areaLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Salario actual</dt>
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
            <p className="mt-2 text-xs text-muted-foreground">
              La categoría ocupacional, el nivel de preparación y el grupo escala se definen en el
              Cargo. El nombre del puesto y la cantidad autorizada («No. de puestos») son propios
              del Puesto.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <SiteCorpButton variant="outline" type="button" onClick={onCancel}>
          Cancelar
        </SiteCorpButton>
        <SiteCorpButton type="submit" disabled={submitting}>
          {submitting
            ? "Guardando..."
            : isEditing
              ? "Guardar cambios"
              : "Crear puesto"}
        </SiteCorpButton>
      </div>
    </form>
  )
}

/** Helper local para comparar horas ya normalizadas. */
const normalized = (time: string): string => normalizeTime(time)
