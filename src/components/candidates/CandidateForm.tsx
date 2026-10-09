import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { Users, ArrowLeft, Save } from "lucide-react"
import { SelectItem } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ciToBirthDate, isValidIdentification, IDENTIFICATION_ERROR_MESSAGE } from "@/utils/ci"
import { CUBA_PROVINCES_FULL, MUNICIPIOS_BY_PROVINCE_FULL } from "@/data/cuba-locations-full"
import {
  fetchCandidateDrivingLicenseIds,
  fetchPersonCatalogs,
  saveCandidateDrivingLicenseIds,
  type CatalogOption,
} from "@/lib/catalogs"
import { DrivingLicenseSelector } from "@/components/person/DrivingLicenseSelector"
import { AcademicDegreeCheckboxes } from "@/components/person/AcademicDegreeCheckboxes"

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
  // Formación académica adicional (indicadores independientes, no excluyentes)
  has_masters_degree: boolean
  has_doctorate_degree: boolean
  profession_or_trade: string | null
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
  has_masters_degree: boolean
  has_doctorate_degree: boolean
  profession_or_trade: string
  political_affiliation: string
  is_retired_or_rehired: string
  has_disciplinary_measures: boolean
  skin_color_id: string
  driving_license_ids: string[]
  // Chequeo Preempleo y Antecedentes Penales
  has_pre_employment_check: boolean
  has_criminal_record_check: boolean
  pre_employment_check_file: File | null
  criminal_record_check_file: File | null
  // Medidas disciplinarias
  disciplinary_document: File | null
}

const emptyFormData: CandidateFormData = {
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
  has_masters_degree: false,
  has_doctorate_degree: false,
  profession_or_trade: "",
  political_affiliation: "",
  is_retired_or_rehired: "",
  has_disciplinary_measures: false,
  skin_color_id: "",
  driving_license_ids: [],
  has_pre_employment_check: false,
  has_criminal_record_check: false,
  pre_employment_check_file: null,
  criminal_record_check_file: null,
  disciplinary_document: null,
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

// Orden visual exacto exigido para el catálogo de Nivel educacional.
const EDUCATION_LEVEL_ORDER = [
  "Primaria",
  "Secundaria",
  "Obrero Calificado",
  "Media",
  "Técnico Medio",
  "Superior",
]

/**
 * Subir o reemplazar documento de verificación para un candidato.
 * Si checkbox desmarcado y ya existe documento, NO lo borra (preservar histórico).
 * Si checkbox marcado con archivo nuevo, sube y crea/actualiza el registro.
 * Si checkbox marcado sin archivo nuevo, mantiene el existente.
 */
async function uploadOrReplaceDocumentForCandidate(
  candidateId: string,
  entityId: string,
  documentTypeId: string,
  hasDocument: boolean,
  file: File | null
): Promise<void> {
  if (!hasDocument) {
    // No borrar documentos históricos al desmarcar el checkbox.
    return
  }

  if (!file) {
    // Mantener el documento existente si no hay nuevo archivo.
    return
  }

  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error("Usuario no autenticado")

  const fileExt = file.name.split(".").pop() || "pdf"
  const fileName = `candidate_${candidateId}_${documentTypeId}_${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    })

  if (uploadError) throw uploadError

  // Buscar si ya existe un documento de este tipo para este candidato
  const { data: existing } = await supabase
    .from("candidate_documents")
    .select("id, storage_path")
    .eq("candidate_id", candidateId)
    .eq("document_type_id", documentTypeId)
    .single()

  if (existing) {
    // Eliminar el archivo físico anterior si existe
    if (existing.storage_path) {
      await supabase.storage.from("documents").remove([existing.storage_path])
    }

    const { error: dbError } = await supabase
      .from("candidate_documents")
      .update({
        original_file_name: file.name,
        storage_path: fileName,
        mime_type: file.type,
        file_size: file.size,
        description: documentTypeId === "PRE_EMPLOYMENT_CHECK" ? "Chequeo Preempleo" : "Antecedentes Penales",
        uploaded_by: user.data.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)

    if (dbError) throw dbError
  } else {
    const { error: dbError } = await supabase
      .from("candidate_documents")
      .insert({
        candidate_id: candidateId,
        document_type_id: documentTypeId,
        original_file_name: file.name,
        storage_path: fileName,
        mime_type: file.type,
        file_size: file.size,
        description: documentTypeId === "PRE_EMPLOYMENT_CHECK" ? "Chequeo Preempleo" : "Antecedentes Penales",
        uploaded_by: user.data.user.id,
      })

    if (dbError) throw dbError
  }
}

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
  const [skinColors, setSkinColors] = React.useState<CatalogOption[]>([])
  const [drivingLicenseCategories, setDrivingLicenseCategories] = React.useState<CatalogOption[]>([])
  const [provinces, setProvinces] = React.useState<{ id: string; name: string }[]>([])
  const [municipalities, setMunicipalities] = React.useState<{ id: string; name: string }[]>([])

  const [formData, setFormData] = React.useState<CandidateFormData>(emptyFormData)
  const [formSubmitting, setFormSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [formSuccess, setFormSuccess] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [hasManagePermission, setHasManagePermission] = React.useState(false)
    // Documentos de verificación existentes, reconstruidos desde candidate_documents.
    const [existingPreEmploymentDoc, setExistingPreEmploymentDoc] = React.useState<{ original_file_name: string } | null>(null)
    const [existingCriminalRecordDoc, setExistingCriminalRecordDoc] = React.useState<{ original_file_name: string } | null>(null)

  // Fetch reference data
  React.useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        // Catálogos globales de la persona (color de piel y licencias): misma fuente
        // que utiliza el trabajador, sin catálogos paralelos por formulario.
        const [{ skinColors: skinColorOptions, licenseCategories }, gendersData, maritalStatusesData, educationLevelsData] = await Promise.all([
          fetchPersonCatalogs(),
          supabase.from("genders").select("id, name").order("name"),
          supabase.from("marital_statuses").select("id, name").order("name"),
          supabase.from("education_levels").select("id, name").order("name"),
        ])

        if (gendersData.error) throw gendersData.error
        if (maritalStatusesData.error) throw maritalStatusesData.error
        if (educationLevelsData.error) throw educationLevelsData.error

        setGenders(gendersData.data || [])
        setMaritalStatuses(maritalStatusesData.data || [])
        setEducationLevels(educationLevelsData.data || [])
        setSkinColors(skinColorOptions)
        setDrivingLicenseCategories(licenseCategories)

        setProvinces(CUBA_PROVINCES_FULL.map(name => ({ id: name, name })))
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

        // Licencias de conducción de la persona (relación 0..N)
                const licenseIds = await fetchCandidateDrivingLicenseIds(candidateId)
        
                // Documentos de verificación existentes (Chequeo Preempleo / Antecedentes Penales).
                // El estado de los checkboxes se reconstruye desde los documentos reales para no
                // depender de un booleano independiente que pueda quedar desincronizado.
                const { data: verificationDocs } = await supabase
                  .from("candidate_documents")
                  .select("id, document_type_id, original_file_name")
                  .eq("candidate_id", candidateId)
                  .in("document_type_id", ["PRE_EMPLOYMENT_CHECK", "CRIMINAL_RECORD"])
        
                const preDoc = verificationDocs?.find(d => d.document_type_id === "PRE_EMPLOYMENT_CHECK") || null
                const crimDoc = verificationDocs?.find(d => d.document_type_id === "CRIMINAL_RECORD") || null
                setExistingPreEmploymentDoc(preDoc)
                setExistingCriminalRecordDoc(crimDoc)
        
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
          has_masters_degree: data.has_masters_degree || false,
          has_doctorate_degree: data.has_doctorate_degree || false,
          profession_or_trade: data.profession_or_trade || "",
          political_affiliation: data.political_affiliation || "",
          is_retired_or_rehired: data.is_retired_or_rehired ? "yes" : "",
          has_disciplinary_measures: data.has_disciplinary_measures || false,
          skin_color_id: data.skin_color_id || "",
          driving_license_ids: licenseIds,
                    has_pre_employment_check: !!preDoc,
                    has_criminal_record_check: !!crimDoc,
          pre_employment_check_file: null,
                    criminal_record_check_file: null,
                    disciplinary_document: null,
                  })
          
                  if (data.province && MUNICIPIOS_BY_PROVINCE_FULL[data.province]) {
          setMunicipalities(MUNICIPIOS_BY_PROVINCE_FULL[data.province].map(name => ({ id: name, name })))
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

  const handleFormChange = (field: keyof CandidateFormData, value: string | boolean | File | null) => {
      setFormData(prev => ({ ...prev, [field]: value }))
    }
  
    // Al cambiar el Nivel educacional: si el nuevo nivel no requiere especialidad,
    // se limpia el valor para que se guarde como NULL.
    const handleEducationLevelChange = (value: string) => {
      const levelId = value === "__placeholder__" ? "" : value
      const level = educationLevels.find(l => l.id === levelId)
      const needsSpecialty = ["Obrero Calificado", "Técnico Medio", "Superior"].includes(level?.name || "")
      setFormData(prev => ({
        ...prev,
        education_level_id: levelId,
        specialty: needsSpecialty ? prev.specialty : "",
      }))
    }
  
    const handleDrivingLicensesChange = (licenseIds: string[]) => {
    setFormData(prev => ({ ...prev, driving_license_ids: licenseIds }))
  }

  const handleIdentificationChange = (value: string) => {
    // Se conserva el valor tal cual se escribe: la validación exige exactamente
    // 11 dígitos (0-9). No se convierte a número para no perder ceros iniciales.
    setFormData(prev => ({ ...prev, identification: value }))

    // La fecha de nacimiento se deriva solo de los dígitos disponibles (ayuda de
    // autocompletado, nunca inventa una fecha).
    const derived = ciToBirthDate(value)
    if (derived) {
      setFormData(prev => ({ ...prev, birth_date: derived }))
    }
  }

  const handleProvinceChange = (province: string) => {
    setFormData(prev => ({ ...prev, province, municipality: "" }))
    setMunicipalities([])

    if (province && MUNICIPIOS_BY_PROVINCE_FULL[province]) {
      setMunicipalities(MUNICIPIOS_BY_PROVINCE_FULL[province].map(name => ({ id: name, name })))
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
    if (!isValidIdentification(formData.identification)) {
      setFormError(IDENTIFICATION_ERROR_MESSAGE)
      return
    }
    // Integridad contractual: al editar un candidato (incluidos los históricos)
    // deben completarse los datos personales indispensables para el contrato.
    if (!formData.birth_date.trim()) {
      setFormError("La fecha de nacimiento es obligatoria")
      return
    }
    if (!formData.profession_or_trade.trim()) {
      setFormError("La profesión u oficio es obligatoria")
      return
    }
    if (!formData.address.trim()) {
      setFormError("La dirección particular es obligatoria")
      return
    }
    if (!formData.province.trim()) {
      setFormError("La provincia es obligatoria")
      return
    }
    if (!formData.municipality.trim()) {
      setFormError("El municipio es obligatorio")
      return
    }

    if (formData.education_level_id) {
          const educationLevel = educationLevels.find(level => level.id === formData.education_level_id)
          const requiresSpecialty = ["Obrero Calificado", "Técnico Medio", "Superior"].includes(educationLevel?.name || "")
          if (requiresSpecialty && !formData.specialty.trim()) {
            setFormError(`La especialidad es obligatoria para ${educationLevel?.name}`)
            return
          }
        }
    
        // Chequeo Preempleo / Antecedentes Penales: el documento es obligatorio mientras
        // el checkbox esté activado y todavía no exista un documento registrado.
        if (formData.has_pre_employment_check && !formData.pre_employment_check_file && !existingPreEmploymentDoc) {
          setFormError("Debe seleccionar el documento de Chequeo Preempleo")
          return
        }
        if (formData.has_criminal_record_check && !formData.criminal_record_check_file && !existingCriminalRecordDoc) {
          setFormError("Debe seleccionar el documento de Antecedentes Penales")
          return
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
                specialty: ["Obrero Calificado", "Técnico Medio", "Superior"].includes(
                  educationLevels.find(l => l.id === formData.education_level_id)?.name || ""
                )
                  ? (formData.specialty.trim() || null)
                  : null,
                has_masters_degree: formData.has_masters_degree,
                has_doctorate_degree: formData.has_doctorate_degree,
                profession_or_trade: formData.profession_or_trade.trim() || null,
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

      // Licencias de conducción: reemplazo exacto y atómico (RPC transaccional),
      // de forma que el resultado en base de datos coincida con la selección.
            await saveCandidateDrivingLicenseIds(candidateId!, formData.driving_license_ids)
      
            // Subir / actualizar documentos de verificación (Chequeo Preempleo y Antecedentes Penales)
            await uploadOrReplaceDocumentForCandidate(candidateId!, effectiveEntityId!, "PRE_EMPLOYMENT_CHECK", formData.has_pre_employment_check, formData.pre_employment_check_file)
            await uploadOrReplaceDocumentForCandidate(candidateId!, effectiveEntityId!, "CRIMINAL_RECORD", formData.has_criminal_record_check, formData.criminal_record_check_file)
      
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

  const requiresSpecialty = ["Obrero Calificado", "Técnico Medio", "Superior"].includes(
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
                <SiteCorpInput type="text" inputMode="numeric" placeholder="11 dígitos" value={formData.identification} onChange={(e) => handleIdentificationChange(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de nacimiento (dd/mm/aaaa) *</Label>
                <SiteCorpInput type="text" placeholder="dd/mm/aaaa" value={formData.birth_date} required onChange={(e) => {
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
                <Label>Dirección particular *</Label>
                <Textarea placeholder="Dirección completa" value={formData.address} onChange={(e) => handleFormChange("address", e.target.value)} rows={2} required />
              </div>
              <div className="space-y-1.5">
                <Label>Provincia *</Label>
                <SiteCorpSelect value={formData.province || undefined} onValueChange={(value) => handleProvinceChange(value === "__placeholder__" ? "" : value)}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {provinces.map(province => (
                    <SelectItem key={province.id} value={province.id}>{province.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Municipio *</Label>
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
                <SiteCorpSelect value={formData.education_level_id || undefined} onValueChange={handleEducationLevelChange}>
                  <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                  {EDUCATION_LEVEL_ORDER
                                      .map(name => educationLevels.find(level => level.name === name))
                                      .filter((level): level is EducationLevel => Boolean(level))
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

            {/* Formación académica adicional: indicadores independientes (no excluyentes) */}
            <div className="space-y-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium text-ink">Formación académica adicional</p>
                <p className="text-xs text-muted-foreground">
                  Marque los estudios de postgrado obtenidos. Puede marcar ambos.
                </p>
              </div>
              <AcademicDegreeCheckboxes
                hasMastersDegree={formData.has_masters_degree}
                hasDoctorateDegree={formData.has_doctorate_degree}
                onMastersChange={(checked) => handleFormChange("has_masters_degree", checked)}
                onDoctorateChange={(checked) => handleFormChange("has_doctorate_degree", checked)}
                disabled={formSubmitting}
              />
            </div>
          </div>
        </SiteCorpCard>

        {/* Section 5: Información profesional (propia de la persona) */}
        <SiteCorpCard>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-ink border-b pb-2">Información profesional</h3>
            <div className="space-y-1.5">
              <Label>Profesión u oficio *</Label>
              <SiteCorpInput
                type="text"
                placeholder="Ej.: Chofer profesional, Albañil, Técnico en redes"
                value={formData.profession_or_trade}
                onChange={(e) => handleFormChange("profession_or_trade", e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Dato propio de la persona. No sustituye al cargo ni al puesto que ocupe.
              </p>
            </div>

            <DrivingLicenseSelector
              categories={drivingLicenseCategories}
              value={formData.driving_license_ids}
              onChange={handleDrivingLicensesChange}
              hint="Seleccione todas las categorías vigentes. Puede dejarlo vacío si no conduce."
            />
          </div>
        </SiteCorpCard>

        {/* Section 6: Verificaciones y medidas disciplinarias */}
                        <SiteCorpCard>
                          <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-ink border-b pb-2">Verificaciones y medidas disciplinarias</h3>
        
                            {/* Chequeo Preempleo */}
                            <div className="space-y-3">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={formData.has_pre_employment_check}
                                  onChange={(e) => handleFormChange("has_pre_employment_check", e.target.checked)}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm font-medium text-ink">Chequeo Preempleo</span>
                              </label>
                              {formData.has_pre_employment_check && (
                                <div className="space-y-2 pl-6">
                                  <label className="block text-sm font-medium">Documento de Chequeo Preempleo</label>
                                  {existingPreEmploymentDoc && !formData.pre_employment_check_file && (
                                    <p className="text-xs text-muted-foreground">
                                      Documento actual: {existingPreEmploymentDoc.original_file_name}
                                    </p>
                                  )}
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={(e) => handleFormChange("pre_employment_check_file", e.target.files?.[0] || null)}
                                    className="block w-full text-sm text-muted-foreground"
                                  />
                                  {formData.pre_employment_check_file && (
                                    <p className="text-xs text-muted-foreground">{formData.pre_employment_check_file.name}</p>
                                  )}
                                </div>
                              )}
                            </div>
        
                            {/* Antecedentes Penales */}
                            <div className="space-y-3">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={formData.has_criminal_record_check}
                                  onChange={(e) => handleFormChange("has_criminal_record_check", e.target.checked)}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm font-medium text-ink">Antecedentes Penales</span>
                              </label>
                              {formData.has_criminal_record_check && (
                                <div className="space-y-2 pl-6">
                                  <label className="block text-sm font-medium">Documento de Antecedentes Penales</label>
                                  {existingCriminalRecordDoc && !formData.criminal_record_check_file && (
                                    <p className="text-xs text-muted-foreground">
                                      Documento actual: {existingCriminalRecordDoc.original_file_name}
                                    </p>
                                  )}
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={(e) => handleFormChange("criminal_record_check_file", e.target.files?.[0] || null)}
                                    className="block w-full text-sm text-muted-foreground"
                                  />
                                  {formData.criminal_record_check_file && (
                                    <p className="text-xs text-muted-foreground">{formData.criminal_record_check_file.name}</p>
                                  )}
                                </div>
                              )}
                            </div>
        
                            {/* Medida disciplinaria */}
                            <div className="border-t pt-4">
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
