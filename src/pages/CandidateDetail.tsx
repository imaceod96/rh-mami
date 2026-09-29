import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SelectItem } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Users,
  Edit3,
  ArrowLeft,
  FileText,
  Briefcase,
  GraduationCap,
  Paperclip,
  FileText as Notes,
  Upload,
  Trash2,
  Download,
  FileType,
  Calendar as CalendarIcon,
  Plus,
  Info,
  Clock,
  Building2,
  UserPlus,
} from "lucide-react"
import HireCandidateDialog from "@/components/candidates/HireCandidateDialog"

interface Candidate {
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
  status: "active" | "archived"
  worker_id: string | null
  created_at: string
  updated_at: string
}

interface Gender {
  id: string
  name: string
}

interface MaritalStatus {
  id: string
  name: string
}

interface EducationLevel {
  id: string
  name: string
}

interface DocumentType {
  id: string
  name: string
  description: string | null
  sort_order: number | null
}

interface CandidateDocument {
  id: string
  candidate_id: string
  document_type_id: string
  original_file_name: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  description: string | null
  is_primary: boolean
  uploaded_by: string | null
  created_at: string
  updated_at: string | null
}

interface WorkExperience {
  id: string
  candidate_id: string
  organization_entity_id: string
  job_title: string
  company_name: string
  start_date: string
  end_date: string | null
  is_current: boolean | null
  description: string | null
  created_at: string
  updated_at: string
}

interface AcademicFormation {
  id: string
  candidate_id: string
  organization_entity_id: string
  program_name: string
  start_date: string
  end_date: string | null
  is_studying: boolean | null
  document_id: string | null
  document: { id: string; original_file_name: string; storage_path: string } | null
  created_at: string
  updated_at: string
}

interface CandidateNote {
  id: string
  candidate_id: string
  organization_entity_id: string
  note_text: string
  created_by: string | null
  created_at: string
  updated_at: string
}

interface AdditionalInfoItem {
  id: string
  candidate_id: string
  organization_entity_id: string
  info_text: string
  created_by: string | null
  created_at: string
  updated_at: string
}

// Parse "YYYY-MM-DD" strings using local time to avoid UTC timezone shifts
const parseDateParts = (dateString: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return isNaN(date.getTime()) ? null : date
}

const formatDurationFromDays = (totalDays: number): string => {
  if (totalDays < 31) return `${totalDays} ${totalDays === 1 ? "día" : "días"}`
  const start = new Date(2000, 0, 1)
  const end = new Date(2000, 0, 1)
  end.setDate(end.getDate() + totalDays)
  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  if (end.getDate() < start.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`)
  if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`)
  return parts.join(" ")
}

const CandidateDetail = () => {
  const { entityId, candidateId } = useParams<{ entityId: string; candidateId: string }>()
  const navigate = useNavigate()
  const { currentEntity } = useCurrentEntity()

  const [candidate, setCandidate] = React.useState<Candidate | null>(null)
  const [genders, setGenders] = React.useState<Gender[]>([])
  const [maritalStatuses, setMaritalStatuses] = React.useState<MaritalStatus[]>([])
  const [educationLevels, setEducationLevels] = React.useState<EducationLevel[]>([])
  const [documentTypes, setDocumentTypes] = React.useState<DocumentType[]>([])
  const [documents, setDocuments] = React.useState<CandidateDocument[]>([])
  const [workExperiences, setWorkExperiences] = React.useState<WorkExperience[]>([])
  const [formations, setFormations] = React.useState<AcademicFormation[]>([])
  const [notes, setNotes] = React.useState<CandidateNote[]>([])
  const [additionalInfo, setAdditionalInfo] = React.useState<AdditionalInfoItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [hasViewPermission, setHasViewPermission] = React.useState(false)
  const [hasManagePermission, setHasManagePermission] = React.useState(false)
  const [notice, setNotice] = React.useState<{ type: "success" | "danger"; message: string } | null>(null)
  const [linkedWorker, setLinkedWorker] = React.useState<{
    id: string
    code: string
    employment_status: string
  } | null>(null)
  const [canManageWorkers, setCanManageWorkers] = React.useState(false)
  const [hireOpen, setHireOpen] = React.useState(false)

  const showNotice = (type: "success" | "danger", message: string) => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 4000)
  }

  // Document upload state
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [selectedDocumentType, setSelectedDocumentType] = React.useState<string>("")
  const [documentDescription, setDocumentDescription] = React.useState("")

  // Work experience dialog state
  const [expDialogOpen, setExpDialogOpen] = React.useState(false)
  const [expSubmitting, setExpSubmitting] = React.useState(false)
  const [expJobTitle, setExpJobTitle] = React.useState("")
  const [expCompany, setExpCompany] = React.useState("")
  const [expStartDate, setExpStartDate] = React.useState("")
  const [expEndDate, setExpEndDate] = React.useState("")
  const [expIsCurrent, setExpIsCurrent] = React.useState(false)
  const [expDescription, setExpDescription] = React.useState("")
  const [expFormError, setExpFormError] = React.useState<string | null>(null)

  // Academic formation dialog state
  const [formationDialogOpen, setFormationDialogOpen] = React.useState(false)
  const [formationSubmitting, setFormationSubmitting] = React.useState(false)
  const [formationProgramName, setFormationProgramName] = React.useState("")
  const [formationStartDate, setFormationStartDate] = React.useState("")
  const [formationEndDate, setFormationEndDate] = React.useState("")
  const [formationIsStudying, setFormationIsStudying] = React.useState(false)
  const [formationFile, setFormationFile] = React.useState<File | null>(null)
  const [formationFormError, setFormationFormError] = React.useState<string | null>(null)

  // Additional info dialog state
  const [infoDialogOpen, setInfoDialogOpen] = React.useState(false)
  const [infoSubmitting, setInfoSubmitting] = React.useState(false)
  const [infoText, setInfoText] = React.useState("")
  const [infoFormError, setInfoFormError] = React.useState<string | null>(null)

  // Note dialog state
  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false)
  const [noteSubmitting, setNoteSubmitting] = React.useState(false)
  const [noteText, setNoteText] = React.useState("")
  const [noteFormError, setNoteFormError] = React.useState<string | null>(null)

  // Fetch reference data
  React.useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [gendersData, maritalStatusesData, educationLevelsData] = await Promise.all([
          supabase.from("genders").select("id, name").order("name"),
          supabase.from("marital_statuses").select("id, name").order("name"),
          supabase.from("education_levels").select("id, name").order("name")
        ])

        if (gendersData.error) throw gendersData.error
        if (maritalStatusesData.error) throw maritalStatusesData.error
        if (educationLevelsData.error) throw educationLevelsData.error

        setGenders(gendersData.data || [])
        setMaritalStatuses(maritalStatusesData.data || [])
        setEducationLevels(educationLevelsData.data || [])
      } catch (err) {
        console.error("Error fetching reference data:", err)
      }
    }

    fetchReferenceData()
  }, [])

  // Fetch document types (global catalog)
  React.useEffect(() => {
    const fetchDocumentTypes = async () => {
      try {
        const { data, error } = await supabase
          .from("document_types")
          .select("id, name, description, sort_order")
          .order("sort_order", { ascending: true })

        if (error) throw error
        setDocumentTypes(data || [])
      } catch (err) {
        console.error("Error fetching document types:", err)
      }
    }

    fetchDocumentTypes()
  }, [])

  // Fetch candidate data
  React.useEffect(() => {
    const fetchCandidate = async () => {
      if (!entityId || !candidateId) {
        setError("Parámetros de URL no válidos")
        return
      }

      setLoading(true)
      setError(null)

      try {
        // First check permissions
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError("Usuario no autenticado")
          return
        }

        // Check if user has view permission for this candidate
        const { data: canView } = await supabase.rpc("can_access_entity", {
          target_entity_id: entityId,
          permission_code: "candidates.view"
        })
        const hasView = !!canView
        setHasViewPermission(hasView)

        // Check if user has manage permission for this candidate
        const { data: canManage } = await supabase.rpc("can_access_entity", {
          target_entity_id: entityId,
          permission_code: "candidates.manage"
        })
        setHasManagePermission(!!canManage)

        // Check if user can manage workers (required to hire)
        const { data: canManageWorkersData } = await supabase.rpc("can_access_entity", {
          target_entity_id: entityId,
          permission_code: "workers.manage"
        })
        setCanManageWorkers(!!canManageWorkersData)

        if (!hasView) {
          setError("No tiene permiso para ver este candidato")
          return
        }

        // Fetch candidate data
        const { data, error: fetchError } = await supabase
          .from("candidates")
          .select("*")
          .eq("id", candidateId)
          .eq("organization_entity_id", entityId)
          .single()

        if (fetchError) throw fetchError

        if (!data) {
          setError("Candidato no encontrado")
          return
        }

        setCandidate(data)

        // Si el candidato está vinculado a un trabajador, cargar su estado
        if (data.worker_id) {
          const { data: linked } = await supabase
            .from("workers")
            .select("id, code, employment_status")
            .eq("id", data.worker_id)
            .maybeSingle()
          setLinkedWorker(
            linked
              ? {
                  id: linked.id,
                  code: linked.code,
                  employment_status: linked.employment_status,
                }
              : null
          )
        } else {
          setLinkedWorker(null)
        }
      } catch (err) {
        console.error("Error fetching candidate:", err)
        setError(err instanceof Error ? err.message : "Error al cargar el candidato")
      } finally {
        setLoading(false)
      }
    }

    fetchCandidate()
  }, [entityId, candidateId])

  // Fetch documents, work experiences, notes and additional info for the candidate
  const fetchRelatedData = React.useCallback(async () => {
    if (!candidateId || !entityId) return

    try {
      const [docsRes, expRes, formationsRes, notesRes, infoRes] = await Promise.all([
        supabase
          .from("candidate_documents")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("candidate_work_experiences")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("start_date", { ascending: false }),
        supabase
          .from("candidate_academic_formations")
          .select("*, document:candidate_documents(id, original_file_name, storage_path)")
          .eq("candidate_id", candidateId)
          .order("start_date", { ascending: false }),
        supabase
          .from("candidate_notes")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false }),
        supabase
          .from("candidate_additional_info")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })
      ])

      if (docsRes.data) setDocuments(docsRes.data as CandidateDocument[])
      if (expRes.data) setWorkExperiences(expRes.data as WorkExperience[])
      if (formationsRes.data) setFormations(formationsRes.data as AcademicFormation[])
      if (notesRes.data) setNotes(notesRes.data as CandidateNote[])
      if (infoRes.data) setAdditionalInfo(infoRes.data as AdditionalInfoItem[])
    } catch (err) {
      console.error("Error fetching related data:", err)
    }
  }, [candidateId, entityId])

  // Load related data once the candidate is available
  React.useEffect(() => {
    if (candidate) {
      fetchRelatedData()
    }
  }, [candidate, fetchRelatedData])

  // Format display values
  const formatFullName = (candidate: Candidate) => {
    const secondSurname = candidate.second_surname ? ` ${candidate.second_surname}` : ""
    return `${candidate.first_name} ${candidate.first_surname}${secondSurname}`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—"
    const parsed = parseDateParts(dateString)
    const date = parsed || new Date(dateString)
    if (isNaN(date.getTime())) return "—"
    return date.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric"
    })
  }

  const formatMonthYear = (dateString: string) => {
    const parsed = parseDateParts(dateString)
    if (!parsed) return dateString
    return parsed.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long"
    })
  }

  // Format document type name
  const getDocumentTypeName = (typeId: string | null) => {
    if (!typeId) return "—"
    const type = documentTypes.find(d => d.id === typeId)
    return type?.name || "—"
  }

  // Format file size
  const formatFileSize = (size: number | null) => {
    if (!size) return "—"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  // Calculate elapsed time between two dates (years, months, days)
  const calculateDurationBetween = (startDate: string, endDate: string | null, isOngoing: boolean | null) => {
    const start = parseDateParts(startDate)
    if (!start) return "—"
    const end =
      isOngoing || !endDate ? new Date() : parseDateParts(endDate)
    if (!end) return "—"

    const diffMs = end.getTime() - start.getTime()
    if (diffMs < 0) return "—"
    return formatDurationFromDays(Math.floor(diffMs / 86400000))
  }

  // Calculate total accumulated experience across all positions
  const calculateTotalExperience = () => {
    if (workExperiences.length === 0) return null
    const today = new Date()
    let totalDays = 0
    for (const exp of workExperiences) {
      const start = parseDateParts(exp.start_date)
      if (!start) continue
      const end =
        exp.is_current || !exp.end_date ? today : parseDateParts(exp.end_date)
      if (!end) continue
      const days = Math.floor((end.getTime() - start.getTime()) / 86400000)
      if (days > 0) totalDays += days
    }
    if (totalDays === 0) return null
    return formatDurationFromDays(totalDays)
  }

  const getUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  }

  // Upload document function
  const handleUploadDocument = async () => {
    if (!selectedFile || !selectedDocumentType || !candidateId || !entityId) return

    setUploading(true)
    try {
      const user = await supabase.auth.getUser()
      if (!user.data.user) throw new Error("Usuario no autenticado")

      // Generate a unique filename
      const fileExt = selectedFile.name.split(".").pop() || "pdf"
      const fileName = `candidate_${candidateId}_${Date.now()}.${fileExt}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, selectedFile, {
          cacheControl: "3600",
          upsert: false
        })

      if (uploadError) throw uploadError

      // Save reference to database
      const { error: dbError } = await supabase
        .from("candidate_documents")
        .insert({
          candidate_id: candidateId,
          document_type_id: selectedDocumentType,
          original_file_name: selectedFile.name,
          storage_path: fileName,
          mime_type: selectedFile.type,
          file_size: selectedFile.size,
          description: documentDescription || null,
          uploaded_by: user.data.user.id
        })

      if (dbError) throw dbError

      // Close dialog and reset form
      setUploadDialogOpen(false)
      setSelectedFile(null)
      setSelectedDocumentType("")
      setDocumentDescription("")

      // Refresh documents list
      await fetchRelatedData()
      showNotice("success", "Documento subido exitosamente")
    } catch (err) {
      console.error("Error uploading document:", err)
      showNotice("danger", err instanceof Error ? err.message : "Error al subir el documento")
    } finally {
      setUploading(false)
    }
  }

  // Delete document function
  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm("¿Está seguro de que desea eliminar este documento?")) return

    setUploading(true)
    try {
      // First delete from storage
      const { data: document } = await supabase
        .from("candidate_documents")
        .select("storage_path")
        .eq("id", documentId)
        .single()

      if (document?.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("documents")
          .remove([document.storage_path])

        if (storageError) throw storageError
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from("candidate_documents")
        .delete()
        .eq("id", documentId)

      if (dbError) throw dbError

      // Refresh documents list
      await fetchRelatedData()
      showNotice("success", "Documento eliminado exitosamente")
    } catch (err) {
      console.error("Error deleting document:", err)
      showNotice("danger", err instanceof Error ? err.message : "Error al eliminar el documento")
    } finally {
      setUploading(false)
    }
  }

  // Download document function
  const handleDownloadDocument = async (doc: { storage_path: string; original_file_name: string }) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(doc.storage_path)

      if (error) throw error

      // Create download link
      const url = window.URL.createObjectURL(data)
      const a = window.document.createElement("a")
      a.href = url
      a.download = doc.original_file_name
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
    } catch (err) {
      console.error("Error downloading document:", err)
      showNotice("danger", err instanceof Error ? err.message : "Error al descargar el documento")
    }
  }

  // Add work experience
  const handleAddExperience = async () => {
    if (!candidateId || !entityId) return

    setExpFormError(null)
    if (!expJobTitle.trim()) {
      setExpFormError("El puesto de trabajo es obligatorio")
      return
    }
    if (!expCompany.trim()) {
      setExpFormError("La empresa u organización es obligatoria")
      return
    }
    if (!expStartDate) {
      setExpFormError("La fecha de inicio es obligatoria")
      return
    }
    if (!expIsCurrent && !expEndDate) {
      setExpFormError("Indique la fecha de fin o marque «Puesto actual»")
      return
    }
    if (!expIsCurrent && expEndDate && expEndDate < expStartDate) {
      setExpFormError("La fecha de fin no puede ser anterior a la fecha de inicio")
      return
    }

    setExpSubmitting(true)
    try {
      const { error } = await supabase.from("candidate_work_experiences").insert({
        candidate_id: candidateId,
        organization_entity_id: entityId,
        job_title: expJobTitle.trim(),
        company_name: expCompany.trim(),
        start_date: expStartDate,
        end_date: expIsCurrent ? null : expEndDate,
        is_current: expIsCurrent,
        description: expDescription.trim() || null
      })

      if (error) throw error

      setExpDialogOpen(false)
      setExpJobTitle("")
      setExpCompany("")
      setExpStartDate("")
      setExpEndDate("")
      setExpIsCurrent(false)
      setExpDescription("")

      await fetchRelatedData()
      showNotice("success", "Experiencia laboral añadida correctamente")
    } catch (err) {
      console.error("Error adding work experience:", err)
      setExpFormError(err instanceof Error ? err.message : "Error al guardar la experiencia laboral")
    } finally {
      setExpSubmitting(false)
    }
  }

  // Delete work experience
  const handleDeleteExperience = async (id: string) => {
    if (!confirm("¿Está seguro de que desea eliminar esta experiencia laboral?")) return
    try {
      const { error } = await supabase.from("candidate_work_experiences").delete().eq("id", id)
      if (error) throw error
      await fetchRelatedData()
      showNotice("success", "Experiencia laboral eliminada")
    } catch (err) {
      console.error("Error deleting work experience:", err)
      showNotice("danger", "Error al eliminar la experiencia laboral")
    }
  }

  // Add academic formation (with optional title document)
  const handleAddFormation = async () => {
    if (!candidateId || !entityId) return

    setFormationFormError(null)
    if (!formationProgramName.trim()) {
      setFormationFormError("Indique qué estudió (carrera o programa)")
      return
    }
    if (!formationStartDate) {
      setFormationFormError("La fecha de inicio es obligatoria")
      return
    }
    if (!formationIsStudying && !formationEndDate) {
      setFormationFormError("Indique la fecha de fin o marque «Estudios en curso»")
      return
    }
    if (!formationIsStudying && formationEndDate && formationEndDate < formationStartDate) {
      setFormationFormError("La fecha de fin no puede ser anterior a la fecha de inicio")
      return
    }

    setFormationSubmitting(true)
    try {
      // Upload the title document (optional) and register it in candidate_documents
      let documentId: string | null = null
      if (formationFile) {
        const { data: { user } } = await supabase.auth.getUser()
        const fileExt = formationFile.name.split(".").pop() || "pdf"
        const fileName = `candidate_${candidateId}_academic_${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, formationFile, {
            cacheControl: "3600",
            upsert: false
          })
        if (uploadError) throw uploadError

        const { data: docData, error: docError } = await supabase
          .from("candidate_documents")
          .insert({
            candidate_id: candidateId,
            document_type_id: "ACADEMIC_CERTIFICATE",
            original_file_name: formationFile.name,
            storage_path: fileName,
            mime_type: formationFile.type,
            file_size: formationFile.size,
            description: `Título de ${formationProgramName.trim()}`,
            uploaded_by: user?.id || null
          })
          .select("id")
          .single()
        if (docError) throw docError
        documentId = docData.id
      }

      const { error } = await supabase.from("candidate_academic_formations").insert({
        candidate_id: candidateId,
        organization_entity_id: entityId,
        program_name: formationProgramName.trim(),
        start_date: formationStartDate,
        end_date: formationIsStudying ? null : formationEndDate,
        is_studying: formationIsStudying,
        document_id: documentId
      })
      if (error) throw error

      setFormationDialogOpen(false)
      setFormationProgramName("")
      setFormationStartDate("")
      setFormationEndDate("")
      setFormationIsStudying(false)
      setFormationFile(null)

      await fetchRelatedData()
      showNotice("success", "Formación académica añadida correctamente")
    } catch (err) {
      console.error("Error adding academic formation:", err)
      setFormationFormError(err instanceof Error ? err.message : "Error al guardar la formación académica")
    } finally {
      setFormationSubmitting(false)
    }
  }

  // Delete academic formation (and its linked title document)
  const handleDeleteFormation = async (formation: AcademicFormation) => {
    const message = formation.document
      ? "¿Está seguro de que desea eliminar esta formación académica? El título asociado también se eliminará de los documentos."
      : "¿Está seguro de que desea eliminar esta formación académica?"
    if (!confirm(message)) return

    try {
      if (formation.document) {
        await supabase.storage.from("documents").remove([formation.document.storage_path])
        await supabase.from("candidate_documents").delete().eq("id", formation.document.id)
      }
      const { error } = await supabase.from("candidate_academic_formations").delete().eq("id", formation.id)
      if (error) throw error
      await fetchRelatedData()
      showNotice("success", "Formación académica eliminada")
    } catch (err) {
      console.error("Error deleting academic formation:", err)
      showNotice("danger", "Error al eliminar la formación académica")
    }
  }

  // Add additional info
  const handleAddInfo = async () => {
    if (!candidateId || !entityId) return

    setInfoFormError(null)
    if (!infoText.trim()) {
      setInfoFormError("El texto de la información es obligatorio")
      return
    }

    setInfoSubmitting(true)
    try {
      const { error } = await supabase.from("candidate_additional_info").insert({
        candidate_id: candidateId,
        organization_entity_id: entityId,
        info_text: infoText.trim(),
        created_by: await getUserId()
      })

      if (error) throw error

      setInfoDialogOpen(false)
      setInfoText("")

      await fetchRelatedData()
      showNotice("success", "Información adicional añadida correctamente")
    } catch (err) {
      console.error("Error adding additional info:", err)
      setInfoFormError(err instanceof Error ? err.message : "Error al guardar la información")
    } finally {
      setInfoSubmitting(false)
    }
  }

  // Delete additional info
  const handleDeleteInfo = async (id: string) => {
    if (!confirm("¿Está seguro de que desea eliminar esta información?")) return
    try {
      const { error } = await supabase.from("candidate_additional_info").delete().eq("id", id)
      if (error) throw error
      await fetchRelatedData()
      showNotice("success", "Información eliminada")
    } catch (err) {
      console.error("Error deleting additional info:", err)
      showNotice("danger", "Error al eliminar la información")
    }
  }

  // Add note
  const handleAddNote = async () => {
    if (!candidateId || !entityId) return

    setNoteFormError(null)
    if (!noteText.trim()) {
      setNoteFormError("El texto de la nota es obligatorio")
      return
    }

    setNoteSubmitting(true)
    try {
      const { error } = await supabase.from("candidate_notes").insert({
        candidate_id: candidateId,
        organization_entity_id: entityId,
        note_text: noteText.trim(),
        created_by: await getUserId()
      })

      if (error) throw error

      setNoteDialogOpen(false)
      setNoteText("")

      await fetchRelatedData()
      showNotice("success", "Nota añadida correctamente")
    } catch (err) {
      console.error("Error adding note:", err)
      setNoteFormError(err instanceof Error ? err.message : "Error al guardar la nota")
    } finally {
      setNoteSubmitting(false)
    }
  }

  // Delete note
  const handleDeleteNote = async (id: string) => {
    if (!confirm("¿Está seguro de que desea eliminar esta nota?")) return
    try {
      const { error } = await supabase.from("candidate_notes").delete().eq("id", id)
      if (error) throw error
      await fetchRelatedData()
      showNotice("success", "Nota eliminada")
    } catch (err) {
      console.error("Error deleting note:", err)
      showNotice("danger", "Error al eliminar la nota")
    }
  }

  const getGenderName = (genderId: string | null) => {
    if (!genderId) return "—"
    const gender = genders.find(g => g.id === genderId)
    return gender?.name || "—"
  }

  const getMaritalStatusName = (statusId: string | null) => {
    if (!statusId) return "—"
    const status = maritalStatuses.find(s => s.id === statusId)
    return status?.name || "—"
  }

  const getEducationLevelName = (levelId: string | null) => {
    if (!levelId) return "—"
    const level = educationLevels.find(l => l.id === levelId)
    return level?.name || "—"
  }

  const getSpecialtyDisplay = (candidate: Candidate) => {
    if (!candidate.specialty) return "—"
    if (candidate.education_level_id) {
      const level = educationLevels.find(l => l.id === candidate.education_level_id)
      if (level?.name === "Técnico" || level?.name === "Obrero") {
        return candidate.specialty
      }
    }
    return "—"
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Cargando candidato..."
          description="Obteniendo información del candidato"
        />
        <SiteCorpLoading rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Error"
          description="No se pudo cargar el candidato"
        />
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton
            variant="outline"
            onClick={() => navigate(`/entity/${entityId}/candidates`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a candidatos
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Candidato no encontrado"
          description="El candidato solicitado no existe o no tiene acceso"
        />
        <SiteCorpAlert type="info">
          El candidato puede haber sido archivado o no tiene acceso para usted.
        </SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton
            variant="outline"
            onClick={() => navigate(`/entity/${entityId}/candidates`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a candidatos
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  const totalExperience = calculateTotalExperience()

  return (
    <div className="space-y-6 p-6">
      {/* Header with navigation and actions */}
      <div className="flex items-center justify-between">
        <SiteCorpPageHeader
          title={formatFullName(candidate)}
          description={`Candidato en ${currentEntity?.name}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {linkedWorker && linkedWorker.employment_status === "active" && (
                <SiteCorpButton
                  variant="outline"
                  onClick={() =>
                    navigate(`/entity/${entityId}/staffing/workers/${linkedWorker.id}`)
                  }
                >
                  <Briefcase className="mr-2 h-4 w-4" /> Ver trabajador
                </SiteCorpButton>
              )}
              {canManageWorkers && (!linkedWorker || linkedWorker.employment_status !== "active") && (
                <SiteCorpButton onClick={() => setHireOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" /> Contratar
                </SiteCorpButton>
              )}
              {hasManagePermission && (
                <SiteCorpButton
                  variant="outline"
                  onClick={() => navigate(`/entity/${entityId}/candidates/${candidateId}/edit`)}
                >
                  <Edit3 className="mr-2 h-4 w-4" /> Editar candidato
                </SiteCorpButton>
              )}
              <SiteCorpButton
                variant="outline"
                onClick={() => navigate(`/entity/${entityId}/candidates`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver a candidatos
              </SiteCorpButton>
            </div>
          }
        />
      </div>

      {/* Feedback notice */}
      {notice && (
        <SiteCorpAlert type={notice.type}>
          {notice.message}
        </SiteCorpAlert>
      )}

      {/* Indicador de relación laboral */}
      {linkedWorker && (
        <SiteCorpAlert type={linkedWorker.employment_status === "active" ? "success" : "info"}>
          {linkedWorker.employment_status === "active"
            ? `Trabajador activo (${linkedWorker.code}). Este candidato ya forma parte de la plantilla.`
            : `Trabajador histórico (${linkedWorker.code}). Esta persona fue trabajador anteriormente; la acción «Contratar» realizará una reincorporación.`}
        </SiteCorpAlert>
      )}

      {/* Diálogo de contratación */}
      <HireCandidateDialog
        open={hireOpen}
        onOpenChange={setHireOpen}
        entityId={entityId as string}
        candidate={{
          id: candidate.id,
          fullName: formatFullName(candidate),
          identification: candidate.identification,
          worker: linkedWorker,
        }}
        onSuccess={(workerId) =>
          navigate(`/entity/${entityId}/staffing/workers/${workerId}`)
        }
      />

      {/* Candidate info cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SiteCorpCard title="Identificación" description="Datos principales">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Identificación:</span>
              <span className="font-medium text-ink">{candidate.identification}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Fecha nacimiento:</span>
              <span className="font-medium text-ink">{formatDate(candidate.birth_date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sexo:</span>
              <span className="font-medium text-ink">{getGenderName(candidate.gender_id)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Estado civil:</span>
              <span className="font-medium text-ink">{getMaritalStatusName(candidate.marital_status_id)}</span>
            </div>
          </div>
        </SiteCorpCard>

        <SiteCorpCard title="Contacto" description="Información de contacto">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Teléfono:</span>
              <span className="font-medium text-ink">{candidate.phone || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Email:</span>
              <span className="font-medium text-ink">{candidate.email || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Provincia:</span>
              <span className="font-medium text-ink">{candidate.province || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Municipio:</span>
              <span className="font-medium text-ink">{candidate.municipality || "—"}</span>
            </div>
          </div>
        </SiteCorpCard>

        <SiteCorpCard title="Profesional" description="Información profesional">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Nivel educacional:</span>
              <span className="font-medium text-ink">{getEducationLevelName(candidate.education_level_id)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Especialidad:</span>
              <span className="font-medium text-ink">{getSpecialtyDisplay(candidate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Afiliación política:</span>
              <span className="font-medium text-ink">{candidate.political_affiliation || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Retirado/Recontratado:</span>
              <span className="font-medium text-ink">{candidate.is_retired_or_rehired ? "Sí" : "No"}</span>
            </div>
          </div>
        </SiteCorpCard>

        <SiteCorpCard title="Estado" description="Información del sistema">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Estado:</span>
              <SiteCorpStatusBadge status={candidate.status === "active" ? "success" : "neutral"}>
                {candidate.status === "active" ? "Activo" : "Archivado"}
              </SiteCorpStatusBadge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Medidas disciplinarias:</span>
              <span className="font-medium text-ink">{candidate.has_disciplinary_measures ? "Sí" : "No"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Experiencia total:</span>
              <span className="font-medium text-ink">{totalExperience || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Actualizado:</span>
              <span className="font-medium text-ink">
                {new Date(candidate.updated_at).toLocaleDateString("es-ES")}
              </span>
            </div>
          </div>
        </SiteCorpCard>
      </div>

      {/* Tabs for detailed information */}
      <SiteCorpCard>
        <Tabs defaultValue="resumen" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 lg:grid-cols-7">
            <TabsTrigger value="resumen">
              <FileText className="mr-2 h-4 w-4" /> Resumen
            </TabsTrigger>
            <TabsTrigger value="datos-personales">
              <Users className="mr-2 h-4 w-4" /> Datos personales
            </TabsTrigger>
            <TabsTrigger value="experiencia-laboral">
              <Briefcase className="mr-2 h-4 w-4" /> Experiencia
            </TabsTrigger>
            <TabsTrigger value="formacion">
              <GraduationCap className="mr-2 h-4 w-4" /> Formación
            </TabsTrigger>
            <TabsTrigger value="documentos">
              <Paperclip className="mr-2 h-4 w-4" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="info-adicional">
              <Info className="mr-2 h-4 w-4" /> Info adicional
            </TabsTrigger>
            <TabsTrigger value="notas">
              <Notes className="mr-2 h-4 w-4" /> Notas
            </TabsTrigger>
          </TabsList>

          {/* Resumen Tab */}
          <TabsContent value="resumen" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">DATOS PRINCIPALES</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Nombre completo:</span>
                    <span className="font-medium text-ink">{formatFullName(candidate)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Identificación:</span>
                    <span className="font-medium text-ink">{candidate.identification}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Fecha de nacimiento:</span>
                    <span className="font-medium text-ink">{formatDate(candidate.birth_date)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Sexo:</span>
                    <span className="font-medium text-ink">{getGenderName(candidate.gender_id)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Estado civil:</span>
                    <span className="font-medium text-ink">{getMaritalStatusName(candidate.marital_status_id)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">CONTACTO</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Teléfono:</span>
                    <span className="font-medium text-ink">{candidate.phone || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Email:</span>
                    <span className="font-medium text-ink">{candidate.email || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Dirección:</span>
                    <span className="font-medium text-ink">{candidate.address || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Provincia:</span>
                    <span className="font-medium text-ink">{candidate.province || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Municipio:</span>
                    <span className="font-medium text-ink">{candidate.municipality || "—"}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">INFORMACIÓN PROFESIONAL</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Nivel educacional:</span>
                    <span className="font-medium text-ink">{getEducationLevelName(candidate.education_level_id)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Especialidad:</span>
                    <span className="font-medium text-ink">{getSpecialtyDisplay(candidate)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Experiencia laboral total:</span>
                    <span className="font-medium text-ink">{totalExperience || "—"}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">ESTADO</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Estado:</span>
                    <SiteCorpStatusBadge status={candidate.status === "active" ? "success" : "neutral"}>
                      {candidate.status === "active" ? "Activo" : "Archivado"}
                    </SiteCorpStatusBadge>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Medidas disciplinarias:</span>
                    <span className="font-medium text-ink">{candidate.has_disciplinary_measures ? "Sí" : "No"}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Datos personales Tab */}
          <TabsContent value="datos-personales" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">IDENTIFICACIÓN</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Nombre:</span>
                    <span className="font-medium text-ink">{candidate.first_name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Primer apellido:</span>
                    <span className="font-medium text-ink">{candidate.first_surname}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Segundo apellido:</span>
                    <span className="font-medium text-ink">{candidate.second_surname || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Documento de identidad:</span>
                    <span className="font-medium text-ink">{candidate.identification}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Fecha de nacimiento:</span>
                    <span className="font-medium text-ink">{formatDate(candidate.birth_date)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">INFORMACIÓN PERSONAL</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Sexo:</span>
                    <span className="font-medium text-ink">{getGenderName(candidate.gender_id)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Estado civil:</span>
                    <span className="font-medium text-ink">{getMaritalStatusName(candidate.marital_status_id)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">LOCALIZACIÓN Y CONTACTO</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Teléfono:</span>
                    <span className="font-medium text-ink">{candidate.phone || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Email:</span>
                    <span className="font-medium text-ink">{candidate.email || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Dirección:</span>
                    <span className="font-medium text-ink">{candidate.address || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Provincia:</span>
                    <span className="font-medium text-ink">{candidate.province || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Municipio:</span>
                    <span className="font-medium text-ink">{candidate.municipality || "—"}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">INFORMACIÓN EDUCACIONAL</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Nivel educacional:</span>
                    <span className="font-medium text-ink">{getEducationLevelName(candidate.education_level_id)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Especialidad:</span>
                    <span className="font-medium text-ink">{getSpecialtyDisplay(candidate)}</span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <h3 className="text-lg font-semibold text-ink mb-4">OTROS DATOS</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Afiliación política:</span>
                    <span className="font-medium text-ink">{candidate.political_affiliation || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Retirado/Recontratado:</span>
                    <span className="font-medium text-ink">{candidate.is_retired_or_rehired ? "Sí" : "No"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Medidas disciplinarias:</span>
                    <span className="font-medium text-ink">{candidate.has_disciplinary_measures ? "Sí" : "No"}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Experiencia laboral Tab */}
          <TabsContent value="experiencia-laboral" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink">Experiencia laboral</h3>
                {totalExperience && (
                  <p className="text-sm text-muted-foreground">
                    Experiencia total acumulada: <span className="font-medium text-ink">{totalExperience}</span>
                  </p>
                )}
              </div>
              {hasManagePermission && (
                <SiteCorpButton size="sm" onClick={() => setExpDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Añadir experiencia
                </SiteCorpButton>
              )}
            </div>

            {workExperiences.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-ink mb-2">No hay experiencia laboral registrada</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {hasManagePermission
                    ? "Añada la primera experiencia laboral de este candidato."
                    : "Este candidato todavía no tiene experiencias laborales registradas."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {workExperiences.map((exp) => (
                  <div key={exp.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-ink">{exp.job_title}</p>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Building2 className="h-4 w-4" /> {exp.company_name}
                        </p>
                      </div>
                      {hasManagePermission && (
                        <SiteCorpButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteExperience(exp.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </SiteCorpButton>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarIcon className="h-4 w-4" />
                        {formatMonthYear(exp.start_date)} –{" "}
                        {exp.is_current || !exp.end_date ? "Actualidad" : formatMonthYear(exp.end_date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sitecorp-primary/10 px-3 py-1 text-xs font-medium text-sitecorp-primary">
                        <Clock className="h-3.5 w-3.5" />
                        {calculateDurationBetween(exp.start_date, exp.end_date, exp.is_current)}
                      </span>
                    </div>
                    {exp.description && (
                      <p className="mt-3 whitespace-pre-line text-sm text-ink">{exp.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Formación Tab */}
          <TabsContent value="formacion" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Formación académica</h3>
              {hasManagePermission && (
                <SiteCorpButton size="sm" onClick={() => setFormationDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Añadir formación
                </SiteCorpButton>
              )}
            </div>

            {formations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <GraduationCap className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-ink mb-2">No hay formación académica registrada</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {hasManagePermission
                    ? "Añada los estudios realizados por este candidato."
                    : "Este candidato no tiene formación académica registrada."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {formations.map((formation) => (
                  <div key={formation.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-ink">{formation.program_name}</p>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <CalendarIcon className="h-4 w-4" />
                            {formatMonthYear(formation.start_date)} –{" "}
                            {formation.is_studying || !formation.end_date ? "Actualidad" : formatMonthYear(formation.end_date)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-sitecorp-primary/10 px-3 py-1 text-xs font-medium text-sitecorp-primary">
                            <Clock className="h-3.5 w-3.5" />
                            {calculateDurationBetween(formation.start_date, formation.end_date, formation.is_studying)}
                          </span>
                        </div>
                      </div>
                      {hasManagePermission && (
                        <SiteCorpButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFormation(formation)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </SiteCorpButton>
                      )}
                    </div>
                    {formation.document && (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                        <span className="flex items-center gap-2 text-sm text-ink">
                          <FileType className="h-4 w-4 text-muted-foreground" />
                          {formation.document.original_file_name}
                        </span>
                        <SiteCorpButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadDocument(formation.document!)}
                        >
                          <Download className="h-4 w-4" />
                        </SiteCorpButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Documentos Tab */}
          <TabsContent value="documentos" className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-ink">Documentos del candidato</h3>
              {hasManagePermission && (
                <SiteCorpButton
                  size="sm"
                  onClick={() => setUploadDialogOpen(true)}
                >
                  <Upload className="mr-2 h-4 w-4" /> Subir documento
                </SiteCorpButton>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Paperclip className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-ink mb-2">No hay documentos registrados</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  No se han subido documentos para este candidato.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {documents.map((doc) => (
                  <SiteCorpCard key={doc.id} title={doc.original_file_name}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileType className="h-4 w-4" />
                        <span>{getDocumentTypeName(doc.document_type_id)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarIcon className="h-4 w-4" />
                        <span>{formatDate(doc.created_at)}</span>
                      </div>
                      {doc.description && (
                        <p className="text-sm text-ink">{doc.description}</p>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size)} • {doc.mime_type || "—"}
                        </div>
                        <div className="flex gap-2">
                          <SiteCorpButton
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadDocument(doc)}
                          >
                            <Download className="h-4 w-4" />
                          </SiteCorpButton>
                          {hasManagePermission && (
                            <SiteCorpButton
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDocument(doc.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </SiteCorpButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </SiteCorpCard>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Info adicional Tab */}
          <TabsContent value="info-adicional" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Información adicional</h3>
              {hasManagePermission && (
                <SiteCorpButton size="sm" onClick={() => setInfoDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Añadir información
                </SiteCorpButton>
              )}
            </div>

            {additionalInfo.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Info className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-ink mb-2">No hay información adicional</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {hasManagePermission
                    ? "Añada información relevante sobre este candidato."
                    : "Este candidato no tiene información adicional registrada."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {additionalInfo.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="whitespace-pre-line text-sm text-ink">{item.info_text}</p>
                        <p className="text-xs text-muted-foreground">
                          Añadido el {formatDate(item.created_at)}
                        </p>
                      </div>
                      {hasManagePermission && (
                        <SiteCorpButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteInfo(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </SiteCorpButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Notas Tab */}
          <TabsContent value="notas" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Notas</h3>
              {hasManagePermission && (
                <SiteCorpButton size="sm" onClick={() => setNoteDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Nueva nota
                </SiteCorpButton>
              )}
            </div>

            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Notes className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-ink mb-2">No hay notas registradas</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {hasManagePermission
                    ? "Cree la primera nota interna para este candidato."
                    : "Este candidato no tiene notas registradas."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="whitespace-pre-line text-sm text-ink">{note.note_text}</p>
                        <p className="text-xs text-muted-foreground">
                          Creada el {formatDate(note.created_at)}
                        </p>
                      </div>
                      {hasManagePermission && (
                        <SiteCorpButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteNote(note.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </SiteCorpButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SiteCorpCard>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Subir documento</DialogTitle>
            <DialogDescription>
              Seleccione el tipo de documento y cargue el archivo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="document-type">Tipo de documento</Label>
              <SiteCorpSelect
                value={selectedDocumentType || undefined}
                onValueChange={(value) => setSelectedDocumentType(value === "__placeholder__" ? "" : value)}
              >
                <SelectItem value="__placeholder__">Seleccione un tipo</SelectItem>
                {documentTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SiteCorpSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Archivo</Label>
              <input
                type="file"
                id="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-ink file:mr-2 file:py-1 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <SiteCorpInput
                id="description"
                value={documentDescription}
                onChange={(e) => setDocumentDescription(e.target.value)}
                placeholder="Descripción del documento"
              />
            </div>
          </div>
          <DialogFooter>
            <SiteCorpButton
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={uploading}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton
              onClick={handleUploadDocument}
              disabled={uploading || !selectedFile || !selectedDocumentType}
            >
              {uploading ? "Subiendo..." : "Subir documento"}
            </SiteCorpButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Work Experience Dialog */}
      <Dialog open={expDialogOpen} onOpenChange={(open) => {
        setExpDialogOpen(open)
        if (!open) setExpFormError(null)
      }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Añadir experiencia laboral</DialogTitle>
            <DialogDescription>
              Indique el puesto, la organización y el intervalo de tiempo trabajado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="exp-job-title">Puesto de trabajo *</Label>
              <SiteCorpInput
                id="exp-job-title"
                value={expJobTitle}
                onChange={(e) => setExpJobTitle(e.target.value)}
                placeholder="Ej.: Contador"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-company">Empresa u organización *</Label>
              <SiteCorpInput
                id="exp-company"
                value={expCompany}
                onChange={(e) => setExpCompany(e.target.value)}
                placeholder="Ej.: Empresa de Servicios Técnicos"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exp-start-date">Fecha de inicio *</Label>
                <input
                  type="date"
                  id="exp-start-date"
                  value={expStartDate}
                  max={expIsCurrent ? undefined : expEndDate || undefined}
                  onChange={(e) => setExpStartDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-end-date">
                  Fecha de fin {expIsCurrent ? "" : "*"}
                </Label>
                <input
                  type="date"
                  id="exp-end-date"
                  value={expEndDate}
                  min={expStartDate || undefined}
                  disabled={expIsCurrent}
                  onChange={(e) => setExpEndDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="exp-is-current"
                checked={expIsCurrent}
                onChange={(e) => setExpIsCurrent(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="exp-is-current" className="cursor-pointer">
                Puesto actual (sin fecha de fin)
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-description">Descripción de funciones (opcional)</Label>
              <Textarea
                id="exp-description"
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                placeholder="Describa las funciones realizadas en el puesto"
                rows={3}
              />
            </div>
            {expFormError && (
              <SiteCorpAlert type="danger">{expFormError}</SiteCorpAlert>
            )}
          </div>
          <DialogFooter>
            <SiteCorpButton
              variant="outline"
              onClick={() => setExpDialogOpen(false)}
              disabled={expSubmitting}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton onClick={handleAddExperience} disabled={expSubmitting}>
              {expSubmitting ? "Guardando..." : "Añadir experiencia"}
            </SiteCorpButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Academic Formation Dialog */}
      <Dialog open={formationDialogOpen} onOpenChange={(open) => {
        setFormationDialogOpen(open)
        if (!open) setFormationFormError(null)
      }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Añadir formación académica</DialogTitle>
            <DialogDescription>
              Indique qué estudió, el periodo y opcionalmente suba el título obtenido.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="formation-program">Qué estudió (carrera o programa) *</Label>
              <SiteCorpInput
                id="formation-program"
                value={formationProgramName}
                onChange={(e) => setFormationProgramName(e.target.value)}
                placeholder="Ej.: Licenciatura en Contabilidad"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="formation-start-date">Fecha de inicio *</Label>
                <input
                  type="date"
                  id="formation-start-date"
                  value={formationStartDate}
                  max={formationIsStudying ? undefined : formationEndDate || undefined}
                  onChange={(e) => setFormationStartDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="formation-end-date">
                  Fecha de fin {formationIsStudying ? "" : "*"}
                </Label>
                <input
                  type="date"
                  id="formation-end-date"
                  value={formationEndDate}
                  min={formationStartDate || undefined}
                  disabled={formationIsStudying}
                  onChange={(e) => setFormationEndDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="formation-is-studying"
                checked={formationIsStudying}
                onChange={(e) => setFormationIsStudying(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="formation-is-studying" className="cursor-pointer">
                Estudios en curso (sin fecha de fin)
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="formation-file">Documento del título (opcional)</Label>
              <input
                type="file"
                id="formation-file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => setFormationFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-ink file:mr-2 file:py-1 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <p className="text-xs text-muted-foreground">
                El archivo subido quedará disponible en la sección de Documentos como «Título / Certificado académico».
              </p>
            </div>
            {formationFormError && (
              <SiteCorpAlert type="danger">{formationFormError}</SiteCorpAlert>
            )}
          </div>
          <DialogFooter>
            <SiteCorpButton
              variant="outline"
              onClick={() => setFormationDialogOpen(false)}
              disabled={formationSubmitting}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton onClick={handleAddFormation} disabled={formationSubmitting}>
              {formationSubmitting ? "Guardando..." : "Añadir formación"}
            </SiteCorpButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Additional Info Dialog */}
      <Dialog open={infoDialogOpen} onOpenChange={(open) => {
        setInfoDialogOpen(open)
        if (!open) setInfoFormError(null)
      }}>
        <DialogContent className="sm:max-w-[475px]">
          <DialogHeader>
            <DialogTitle>Añadir información adicional</DialogTitle>
            <DialogDescription>
              Escriba la información que desee asociar a este candidato.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="info-text">Información *</Label>
              <Textarea
                id="info-text"
                value={infoText}
                onChange={(e) => setInfoText(e.target.value)}
                placeholder="Ej.: Dispone de licencia de conducción categoría B"
                rows={4}
              />
            </div>
            {infoFormError && (
              <SiteCorpAlert type="danger">{infoFormError}</SiteCorpAlert>
            )}
          </div>
          <DialogFooter>
            <SiteCorpButton
              variant="outline"
              onClick={() => setInfoDialogOpen(false)}
              disabled={infoSubmitting}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton onClick={handleAddInfo} disabled={infoSubmitting}>
              {infoSubmitting ? "Guardando..." : "Añadir información"}
            </SiteCorpButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={(open) => {
        setNoteDialogOpen(open)
        if (!open) setNoteFormError(null)
      }}>
        <DialogContent className="sm:max-w-[475px]">
          <DialogHeader>
            <DialogTitle>Nueva nota</DialogTitle>
            <DialogDescription>
              Escriba una nota interna sobre este candidato.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="note-text">Nota *</Label>
              <Textarea
                id="note-text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Escriba el contenido de la nota"
                rows={4}
              />
            </div>
            {noteFormError && (
              <SiteCorpAlert type="danger">{noteFormError}</SiteCorpAlert>
            )}
          </div>
          <DialogFooter>
            <SiteCorpButton
              variant="outline"
              onClick={() => setNoteDialogOpen(false)}
              disabled={noteSubmitting}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton onClick={handleAddNote} disabled={noteSubmitting}>
              {noteSubmitting ? "Guardando..." : "Guardar nota"}
            </SiteCorpButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CandidateDetail
