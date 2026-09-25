import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { Users, ArrowLeft, Save } from "lucide-react"
import { SelectItem } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface Candidate {
  id: string
  tenant_id: string
  organization_entity_id: string
  first_name: string
  first_surname: string
  second_surname: string | null
  identification: string
  birth_date: string | null
  gender_id: string | null
  marital_status_id: string | null
  phone: string | null
  email: string | null
  address: string | null
  municipality: string | null
  province: string | null
  education_level_id: string | null
  specialty: string | null
  political_affiliation: string | null
  is_retired_or_rehired: boolean | null
  has_disciplinary_measures: boolean | null
  skin_color_id: string | null
  status: "active" | "archived"
  created_at: string
  updated_at: string
}

export interface Gender {
  id: string
  name: string
}

export interface MaritalStatus {
  id: string
  name: string
}

export interface EducationLevel {
  id: string
  name: string
}

export interface SkinColor {
  id: string
  name: string
}

export interface DrivingLicenseCategory {
  id: string
  name: string
  code: string
}

export interface CandidateFormData {
  first_name: string
  first_surname: string
  second_surname: string
  identification: string
  birth_date: string
  gender_id: string
  marital_status_id: string
  phone: string
  email: string
  address: string
  municipality: string
  province: string
  education_level_id: string
  specialty: string
  political_affiliation: string
  is_retired_or_rehired: string
  has_disciplinary_measures: boolean
  skin_color_id: string
  driving_license_ids: string[]
}

export const emptyFormData: CandidateFormData = {
  first_name: "",
  first_surname: "",
  second_surname: "",
  identification: "",
  birth_date: "",
  gender_id: "",
  marital_status_id: "",
  phone: "",
  email: "",
  address: "",
  municipality: "",
  province: "",
  education_level_id: "",
  specialty: "",
  political_affiliation: "",
  is_retired_or_rehired: "",
  has_disciplinary_measures: false,
  skin_color_id: "",
  driving_license_ids: [],
}

const CUBA_PROVINCES = [
  "Pinar del Río", "Artemisa", "La Habana", "Mayabeque", "Matanzas",
  "Cienfuegos", "Villa Clara", "Sancti Spíritus", "Ciego de Ávila",
  "Camagüey", "Las Tunas", "Holguín", "Granma", "Santiago de Cuba",
  "Guantánamo", "Isla de la Juventud",
]

const MUNICIPIOS_BY_PROVINCE: Record<string, string[]> = {
  "Pinar del Río": ["Pinar del Río", "San Luis", "Sandino", "Consolación del Sur", "Guane", "Mantua", "Viñales", "La Palma", "Los Palacios", "San Juan y Martínez", "San Cristóbal"],
  "Artemisa": ["Artemisa", "Bauta", "Caimito", "Guanajay", "Güines", "Mariel", "San Antonio de los Baños", "San José de las Lajas"],
  "La Habana": ["La Habana Vieja", "Centro Habana", "Plaza de la Revolución", "Cerro", "Marianao", "10 de Octubre", "La Lisa", "Playa", "Miramar", "Regla", "Guanabacoa", "San Miguel del Padrón", "Diez de Octubre", "Boyeros", "Cotorro", "San José de las Lajas"],
  "Mayabeque": ["San José de las Lajas", "Güines", "Batabanó", "Bejucal", "San Nicolás de Bari", "Santa Cruz del Norte", "Nueva Paz", "San Nicolás", "Madruga", "Melena del Sur", "Quivicán"],
  "Matanzas": ["Matanzas", "Cárdenas", "Colón", "Jagüey Grande", "Jovellanos", "Pedro Betancourt", "Unión de Reyes", "Calimete", "Corralillo", "Guaguasi", "Limonar", "Perico", "Martí"],
  "Cienfuegos": ["Cienfuegos", "Abreus", "Aguada de Pasajeros", "Cumanayagua", "Lajas", "Palmira", "Rodas", "Cumanayagua"],
  "Villa Clara": ["Santa Clara", "Camajuaní", "Caibarién", "Placetas", "Sagua la Grande", "Manicaragua", "Remedios", "Cifuentes", "Santo Domingo", "Zulueta"],
  "Sancti Spíritus": ["Sancti Spíritus", "Trinidad", "Fomento", "Yaguajay", "Zaza del Medio", "Jatibonico", "La Sierpe", "Taguasco", "Tuinicú"],
  "Ciego de Ávila": ["Ciego de Ávila", "Morón", "Baraguá", "Chambas", "Majagua", "Ciro Redondo", "Venezuela", "Florencia"],
  "Camagüey": ["Camagüey", "Nuevitas", "Florida", "Sierra de Cubitas", "Esmeralda", "Vertientes", "Jimaguayú", "Najasa", "Santa Cruz del Sur", "Sibanicú", "Guáimaro"],
  "Las Tunas": ["Las Tunas", "Manatí", "Puerto Padre", "Colombia", "Jesús Menéndez", "Jobabo", "Amancio", "Cauto Cristo"],
  "Holguín": ["Holguín", "Banes", "Frank País", "Mayarí", "Antilla", "Báguanos", "Cacocum", "Cueto", "Gibara", "Rafael Freyre", "Río Cauto", "Sagua de Tánamo"],
  "Granma": ["Bayamo", "Manzanillo", "Jiguaní", "Buey Arriba", "Campechuela", "Cauto Cristo", "Guisa", "Jiguaní", "Niquero", "Pilón", "Yara"],
  "Santiago de Cuba": ["Santiago de Cuba", "Contramaestre", "Guamá", "Mella", "Palma Soriano", "San Luis", "Siboney", "Tercer Frente", "Segundo Frente", "Baconao"],
  "Guantánamo": ["Guantánamo", "Baracoa", "Caimanera", "El Salvador", "Maisí", "Manuel Tames", "Niceto Pérez", "San Antonio del Sur", "Yateras"],
  "Isla de la Juventud": ["Nueva Gerona", "Santa Fe"],
}

const POLITICAL_AFFILIATIONS = [
  { id: "pcc", name: "PCC" },
  { id: "ujc", name: "UJC" },
  { id: "none", name: "Ninguna" },
]

const RETIRED_REHIRED_OPTIONS = [
  { id: "yes", name: "Sí" },
  { id: "no", name: "No" },
]

interface CandidateFormProps {
  candidateId?: string
  entityId?: string
  mode?: "create" | "edit"
  onSuccess?: () => void
  onCancel?: () => void
}

const CandidateForm = ({ candidateId, entityId: propEntityId, mode = "edit", onSuccess, onCancel }: CandidateFormProps) => {
  const { entityId: contextEntityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const { currentEntity } = useCurrentEntity()
  const effectiveEntityId = propEntityId || contextEntityId

  const [candidate, setCandidate] = React.useState<Candidate | null>(null)
  const [genders, setGenders] = React.useState<Gender[]>([])
  const [maritalStatuses, setMaritalStatuses] = React.useState<MaritalStatus[]>([])
  const [educationLevels, setEducationLevels] = React.useState<EducationLevel[]>([])
  const [skinColors, setSkinColors] = React.useState<SkinColor[]>([])
  const [drivingLicenseCategories, setDrivingLicenseCategories] = React.useState<DrivingLicenseCategory[]>([])
  const [candidateDrivingLicenses, setCandidateDrivingLicenses] = React.useState<string[]>([])
  const [provinces, setProvinces] = React.useState<{ id: string; name: string }[]>([])
  const [municipalities, setMunicipalities] = React.useState<{ id: string; name: string }[]>([])

  const [formData, setFormData] = React.useState<CandidateFormData>(emptyFormData)
  const [formSubmitting, setFormSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [formSuccess, setFormSuccess] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [hasManagePermission, setHasManagePermission] = React.useState(false)

  // Fetch reference data
  React.useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [gendersData, maritalStatusesData, educationLevelsData, skinColorsData, drivingLicenseData] = await Promise.all([
          supabase.from("genders").select("id, name").order("name"),
          supabase.from("marital_statuses").select("id, name").order("name"),
          supabase.from("education_levels").select("id, name").order("name"),
          supabase.from("skin_colors").select("id, name").order("name"),
          supabase.from("driving_license_categories").select("id, name, code").order("name"),
        ])

        if (gendersData.error) throw gendersData.error
        if (maritalStatusesData.error) throw maritalStatusesData.error
        if (educationLevelsData.error) throw educationLevelsData.error
        if (skinColorsData.error) throw skinColorsData.error
        if (drivingLicenseData.error) throw drivingLicenseData.error

        setGenders(gendersData.data || [])
        setMaritalStatuses(maritalStatusesData.data || [])
        setEducationLevels(educationLevelsData.data || [])
        setSkinColors(skinColorsData.data || [])
        setDrivingLicenseCategories(drivingLicenseData.data || [])

        setProvinces(CUBA_PROVINCES.map(name => ({ id: name, name })))
      } catch (err) {
        console.error("Error fetching reference data:", err)
        setError("Error al cargar datos de referencia")
      }
    }

    fetchReferenceData()
  }, [])

  // Fetch candidate data for edit mode
  React.useEffect(() => {
    const fetchCandidate = async () => {
      if (!effectiveEntityId || !candidateId || mode !== "edit") return

      setLoading(true)
      setError(null)

      try {
        const { data: canManage } = await supabase.rpc("can_access_entity", {
          target_entity_id: effectiveEntityId,
          permission_code: "candidates.manage"
        })
        setHasManagePermission(!!canManage)

        if (!canManage) {
          setError("No tiene permiso para editar este candidato")
          return
        }

        const { data, error: fetchError } = await supabase
          .from("candidates")
          .select("*")
          .eq("id", candidateId)
          .eq("organization_entity_id", effectiveEntityId)
          .single()

        if (fetchError) throw fetchError
        if (!data) {
          setError("Candidato no encontrado")
          return
        }

        setCandidate(data)

        // Fetch candidate's driving licenses
        const { data: dlcData } = await supabase
          .from("candidate_driving_license_categories")
          .select("driving_license_category_id")
          .eq("candidate_id", candidateId)

        const licenseIds = (dlcData || []).map((d: any) => d.driving_license_category_id)
        setCandidateDrivingLicenses(licenseIds)

        // Pre-populate form
        setFormData({
          first_name: data.first_name,
          first_surname: data.first_surname,
          second_surname: data.second_surname || "",
          identification: data.identification,
          birth_date: data.birth_date || "",
          gender_id: data.gender_id || "",
          marital_status_id: data.marital_status_id || "",
          phone: data.phone || "",
          email: data.email || "",
          address: data.address || "",
          municipality: data.municipality || "",
          province: data.province || "",
          education_level_id: data.education_level_id || "",
          specialty: data.specialty || "",
          political_affiliation: data.political_affiliation || "",
          is_retired_or_rehired: data.is_retired_or_rehired ? "yes" : "",
          has_disciplinary_measures: data.has_disciplinary_measures || false,
          skin_color_id: data.skin_color_id || "",
          driving_license_ids: licenseIds,
        })

        if (data.province && MUNICIPIOS_BY_PROVINCE[data.province]) {
          setMunicipalities(MUNICIPIOS_BY_PROVINCE[data.province].map(name => ({ id: name, name })))
        }
      } catch (err) {
        console.error("Error fetching candidate:", err)
        setError(err instanceof Error ? err.message : "Error al cargar el candidato")
      } finally {
        setLoading(false)
      }
    }

    fetchCandidate()
  }, [effectiveEntityId, candidateId, mode])

  const handleFormChange = (field: keyof CandidateFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleDrivingLicenseChange = (licenseId: string, checked: boolean) => {
    setCandidateDrivingLicenses(prev => {
      if (checked) {
        return [...prev, licenseId]
      } else {
        return prev.filter(id => id !== licenseId)
      }
    })
    setFormData(prev => ({
      ...prev,
      driving_license_ids: checked
        ? [...prev.driving_license_ids, licenseId]
        : prev.driving_license_ids.filter(id => id !== licenseId)
    }))
  }

  const handleIdentificationChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "")
    setFormData(prev => ({ ...prev, identification: cleaned }))

    if (cleaned.length >= 6) {
      const yearStr = cleaned.substring(0, 2)
      const monthStr = cleaned.substring(2, 4)
      const dayStr = cleaned.substring(4, 6)

      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)
      const day = parseInt(dayStr, 10)

      if (year >= 0 && year <= 99 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const fullYear = year >= 50 ? 1900 + year : 2000 + year
        const date = new Date(fullYear, month - 1, day)
        const dateStr = date.toISOString().split("T")[0]
        setFormData(prev => ({ ...prev, birth_date: dateStr }))
      }
    }
  }

  const handleProvinceChange = (province: string) => {
    setFormData(prev => ({ ...prev, province, municipality: "" }))
    setMunicipalities([])

    if (province && MUNICIPIOS_BY_PROVINCE[province]) {
      setMunicipalities(MUNICIPIOS_BY_PROVINCE[province].map(name => ({ id: name, name })))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.first_name.trim()) {
      setFormError("El nombre es obligatorio")
      return
    }
    if (!formData.first_surname.trim()) {
      setFormError("El primer apellido es obligatorio")
      return
    }
    if (!formData.identification.trim()) {
      setFormError("La identificación es obligatoria")
      return
    }

    if (formData.education_level_id) {
      const educationLevel = educationLevels.find(level => level.id === formData.education_level_id)
      const requiresSpecialty = ["Técnico", "Obrero"].includes(educationLevel?.name || "")
      if (requiresSpecialty && !formData.specialty.trim()) {
        setFormError(`La especialidad es obligatoria para ${educationLevel?.name}`)
        return
      }
    }

    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        setFormError("El formato del email no es válido")
        return
      }
    }

    setFormSubmitting(true)
    setFormError(null)

    try {
      const updatedCandidate = {
        first_name: formData.first_name.trim(),
        first_surname: formData.first_surname.trim(),
        second_surname: formData.second_surname.trim() || null,
        identification: formData.identification.trim(),
        birth_date: formData.birth_date || null,
        gender_id: formData.gender_id || null,
        marital_status_id: formData.marital_status_id || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        municipality: formData.municipality.trim() || null,
        province: formData.province.trim() || null,
        education_level_id: formData.education_level_id || null,
        specialty: formData.specialty.trim() || null,
        political_affiliation: formData.political_affiliation || null,
        is_retired_or_rehired: formData.is_retired_or_rehired === "yes",
        has_disciplinary_measures: formData.has_disciplinary_measures,
        skin_color_id: formData.skin_color_id || null,
        updated_at: new Date().toISOString(),
      }

      const { error: updateError } = await supabase
        .from("candidates")
        .update(updatedCandidate)
        .eq("id", candidateId)
        .eq("organization_entity_id", effectiveEntityId)

      if (updateError) throw updateError

      // Update driving licenses
      // First delete existing
      await supabase
        .from("candidate_driving_license_categories")
        .delete()
        .eq("candidate_id", candidateId)

      // Then insert new ones
      if (formData.driving_license_ids.length > 0) {
        const licenseRows = formData.driving_license_ids.map(licenseId => ({
          candidate_id: candidateId,
          driving_license_category_id: licenseId,
        }))
        await supabase
          .from("candidate_driving_license_categories")
          .insert(licenseRows)
      }

      setFormSuccess(true)

      // Refresh candidate data
      const { data } = await supabase
        .from("candidates")
        .select("*")
        .eq("id", candidateId)
        .eq("organization_entity_id", effectiveEntityId)
        .single()

      if (data) {
        setCandidate(data)
      }

      setTimeout(() => {
        setFormSuccess(false)
        if (onSuccess) {
          onSuccess()
        } else if (onCancel) {
          onCancel()
        } else {
          navigate(`/entity/${effectiveEntityId}/candidates/${candidateId}`)
        }
      }, 1500)
    } catch (err) {
      console.error("Error updating candidate:", err)
      setFormError("Error al actualizar el candidato. Inténtalo de nuevo.")
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      navigate(`/entity/${effectiveEntityId}/candidates/${candidateId}`)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Cargando candidato..." description="Obteniendo información del candidato" />
        <SiteCorpLoading rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Error" description="No se pudo cargar el candidato" />
        <SiteCorpAlert type="danger">{error}</SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton variant="outline" onClick={handleCancel}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a candidato
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Candidato no encontrado" description="El candidato solicitado no existe o no tiene acceso" />
        <SiteCorpAlert type="info">El candidato puede haber sido archivado o no tiene acceso para usted.</SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton variant="outline" onClick={handleCancel}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a candidatos
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  const requiresSpecialty = ["Técnico", "Obrero"].includes(
    educationLevels.find(l => l.id === formData.education_level_id)?.name || ""
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <SiteCorpPageHeader
          title={mode === "edit" ? `Editar: ${candidate.first_name} ${candidate.first_surname}` : "Nuevo candidato"}
          description={`${mode === "edit" ? "Editando" : "Creando"} candidato en ${currentEntity?.name}`}
        />
        <SiteCorpButton variant="outline" onClick={handleCancel}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a candidato
        </SiteCorpButton>
      </div>

      {formSuccess && (
        <SiteCorpAlert type="success">Candidato actualizado exitosamente</SiteCorpAlert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Identificación */}
        <SiteCorpCard>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-ink border-b pb-2">Identificación</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <SiteCorpInput type="text" placeholder="Nombre" value={formData.first_name} onChange={(e) => handleFormChange("first_name", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Primer apellido *</Label>
                <SiteCorpInput type="text" placeholder="Primer apellido" value={formData.first_surname} onChange={(e) => handleFormChange("first_surname", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Segundo apellido</Label>
                <SiteCorpInput type="text" placeholder="Segundo apellido" value={formData.second_surname} onChange={(e) => handleFormChange("second_surname", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Identificación *</Label>
                <SiteCorpInput type="text" placeholder="Cédula / DNI / Pasaporte" value={formData.identification} onChange={(e) => handleIdentificationChange(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de nacimiento (dd/mm/aaaa)</Label>
                <SiteCorpInput type="text" placeholder="dd/mm/aaaa" value={formData.birth_date} onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").substring(0, 8)
                  let formatted = val
                  if (val.length > 4) formatted = `${val.substring(0, 2)}/${val.substring(2, 4)}/${val.substring(4, 8)}`
                  else if (val.length > 2) formatted = `${val.substring(0, 2)}/${val.substring(2)}`
                  handleFormChange("birth_date", formatted)
                }} />
              </div>
              <div className="space-y-1.5">
                <Label>Sexo</Label>
                <SiteCorpSelect value={formData.gender_id || undefined} onValueChange={(value) => handleFormChange("gender_id", value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {genders.map(gender => (
                    <SelectItem key={gender.id} value={gender.id}>{gender.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Color de piel</Label>
                <SiteCorpSelect value={formData.skin_color_id || undefined} onValueChange={(value) => handleFormChange("skin_color_id", value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {skinColors.map(color => (
                    <SelectItem key={color.id} value={color.id}>{color.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
            </div>
          </div>
        </SiteCorpCard>

        {/* Section 2: Datos personales */}
        <SiteCorpCard>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-ink border-b pb-2">Datos personales</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Estado civil</Label>
                <SiteCorpSelect value={formData.marital_status_id || undefined} onValueChange={(value) => handleFormChange("marital_status_id", value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {maritalStatuses.map(status => (
                    <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Afiliación política</Label>
                <SiteCorpSelect value={formData.political_affiliation || undefined} onValueChange={(value) => handleFormChange("political_affiliation", value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {POLITICAL_AFFILIATIONS.map(aff => (
                    <SelectItem key={aff.id} value={aff.id}>{aff.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Retirado o Recontratado</Label>
                <SiteCorpSelect value={formData.is_retired_or_rehired || undefined} onValueChange={(value) => handleFormChange("is_retired_or_rehired", value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {RETIRED_REHIRED_OPTIONS.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
            </div>
          </div>
        </SiteCorpCard>

        {/* Section 3: Contacto y dirección */}
        <SiteCorpCard>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-ink border-b pb-2">Contacto y dirección</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <SiteCorpInput type="tel" placeholder="+51 999 999 999" value={formData.phone} onChange={(e) => handleFormChange("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <SiteCorpInput type="email" placeholder="correo@ejemplo.com" value={formData.email} onChange={(e) => handleFormChange("email", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Dirección</Label>
                <Textarea placeholder="Dirección completa" value={formData.address} onChange={(e) => handleFormChange("address", e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Provincia</Label>
                <SiteCorpSelect value={formData.province || undefined} onValueChange={(value) => handleProvinceChange(value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {provinces.map(province => (
                    <SelectItem key={province.id} value={province.id}>{province.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Municipio</Label>
                <SiteCorpSelect value={formData.municipality || undefined} onValueChange={(value) => handleFormChange("municipality", value === "__placeholder__" ? "" : value)} disabled={!formData.province}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {municipalities.map(muni => (
                    <SelectItem key={muni.id} value={muni.id}>{muni.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
            </div>
          </div>
        </SiteCorpCard>

        {/* Section 4: Formación */}
        <SiteCorpCard>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-ink border-b pb-2">Formación</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nivel educacional</Label>
                <SiteCorpSelect value={formData.education_level_id || undefined} onValueChange={(value) => handleFormChange("education_level_id", value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {educationLevels
                    .filter(level => ["Primaria", "Secundaria", "Obrero", "Técnico", "Bachiller", "Superior"].includes(level.name))
                    .map(level => (
                      <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                    ))}
                </SiteCorpSelect>
              </div>
              {requiresSpecialty && (
                <div className="space-y-1.5">
                  <Label>Especialidad *</Label>
                  <SiteCorpInput type="text" placeholder="Especialidad" value={formData.specialty} onChange={(e) => handleFormChange("specialty", e.target.value)} required />
                </div>
              )}
            </div>
          </div>
        </SiteCorpCard>

        {/* Section 5: Licencias de conducción */}
        <SiteCorpCard>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-ink border-b pb-2">Licencias de conducción</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {drivingLicenseCategories.map(license => (
                <label key={license.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.driving_license_ids.includes(license.id)}
                    onChange={(e) => handleDrivingLicenseChange(license.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-ink">{license.name}</span>
                </label>
              ))}
            </div>
          </div>
        </SiteCorpCard>

        {/* Section 6: Medidas disciplinarias */}
        <SiteCorpCard>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-ink border-b pb-2">Medidas disciplinarias</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.has_disciplinary_measures}
                  onChange={(e) => handleFormChange("has_disciplinary_measures", e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-ink">Sí, tiene medidas disciplinarias</span>
              </label>
            </div>
          </div>
        </SiteCorpCard>

        {/* Form error */}
        {formError && (
          <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>
        )}

        {/* Form footer */}
        <div className="flex justify-end gap-2">
          <SiteCorpButton type="button" variant="outline" onClick={handleCancel} disabled={formSubmitting}>
            Cancelar
          </SiteCorpButton>
          <SiteCorpButton type="submit" disabled={formSubmitting}>
            <Save className="mr-2 h-4 w-4" />
            {formSubmitting ? "Guardando..." : "Guardar cambios"}
          </SiteCorpButton>
        </div>
      </form>
    </div>
  )
}

export default CandidateForm
