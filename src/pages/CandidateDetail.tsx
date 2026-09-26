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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Users, Edit3, ArrowLeft, FileText, Briefcase, GraduationCap, Paperclip, FileText as Notes, Upload, Trash2, Download, FileType, Calendar } from "lucide-react"

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
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [hasViewPermission, setHasViewPermission] = React.useState(false)
  const [hasManagePermission, setHasManagePermission] = React.useState(false)

  // Document upload state
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [selectedDocumentType, setSelectedDocumentType] = React.useState<string>("")
  const [documentDescription, setDocumentDescription] = React.useState("")

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

  // Fetch documents for the candidate
  const fetchDocuments = React.useCallback(async () => {
    if (!candidateId || !entityId) return

    setLoading(true)
    setError(null)

    try {
      // Check permission
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

      if (!hasView) {
        setError("No tiene permiso para ver este candidato")
        return
      }

      // Fetch documents
      const { data, error: fetchError } = await supabase
        .from("candidate_documents")
        .select(`
          *,
          document_types!candidate_documents_document_type_id_fkey (name, description)
        `)
        .eq("candidate_id", candidateId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false })

      if (fetchError) throw fetchError

      setDocuments(data || [])
    } catch (err) {
      console.error("Error fetching documents:", err)
      setError(err instanceof Error ? err.message : "Error al cargar los documentos")
    } finally {
      setLoading(false)
    }
  }, [candidateId, entityId])

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

        // Only check permission after we have the result
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
      } catch (err) {
        console.error("Error fetching candidate:", err)
        setError(err instanceof Error ? err.message : "Error al cargar el candidato")
      } finally {
        setLoading(false)
      }
    }

    fetchCandidate()
  }, [entityId, candidateId])

  // Format display values
  const formatFullName = (candidate: Candidate) => {
    const secondSurname = candidate.second_surname ? ` ${candidate.second_surname}` : ""
    return `${candidate.first_name} ${candidate.first_surname}${secondSurname}`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—"
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric"
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
      await fetchDocuments()

      // Show success message
      setError("Documento subido exitosamente")
      setTimeout(() => setError(null), 3000)
    } catch (err) {
      console.error("Error uploading document:", err)
      setError(err instanceof Error ? err.message : "Error al subir el documento")
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
      await fetchDocuments()

      setError("Documento eliminado exitosamente")
      setTimeout(() => setError(null), 3000)
    } catch (err) {
      console.error("Error deleting document:", err)
      setError(err instanceof Error ? err.message : "Error al eliminar el documento")
    } finally {
      setUploading(false)
    }
  }

  // Download document function
  const handleDownloadDocument = async (document: CandidateDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(document.storage_path)

      if (error) throw error

      // Create download link
      const url = window.URL.createObjectURL(data)
      const a = document.createElement("a")
      a.href = url
      a.download = document.original_file_name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error("Error downloading document:", err)
      setError(err instanceof Error ? err.message : "Error al descargar el documento")
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

  return (
    <div className="space-y-6 p-6">
      {/* Header with navigation and actions */}
      <div className="flex items-center justify-between">
        <SiteCorpPageHeader
          title={formatFullName(candidate)}
          description={`Candidato en ${currentEntity?.name}`}
          actions={
            <div className="flex items-center gap-2">
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
              <span className="text-sm text-muted-foreground">Creado:</span>
              <span className="font-medium text-ink">
                {new Date(candidate.created_at).toLocaleDateString("es-ES")}
              </span>
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="resumen">
              <FileText className="mr-2 h-4 w-4" /> Resumen
            </TabsTrigger>
            <TabsTrigger value="datos-personales">
              <Users className="mr-2 h-4 w-4" /> Datos personales
            </TabsTrigger>
            <TabsTrigger value="experiencia-laboral">
              <Briefcase className="mr-2 h-4 w-4" /> Experiencia laboral
            </TabsTrigger>
            <TabsTrigger value="formacion">
              <GraduationCap className="mr-2 h-4 w-4" /> Formación
            </TabsTrigger>
            <TabsTrigger value="documentos">
              <Paperclip className="mr-2 h-4 w-4" /> Documentos
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
            <div className="flex flex-col items-center justify-center py-12">
              <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-ink mb-2">No hay experiencia laboral registrada</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                La experiencia laboral detallada se implementará en la siguiente fase (Candidatos 2.2).
              </p>
            </div>
          </TabsContent>

          {/* Formación Tab */}
          <TabsContent value="formacion" className="space-y-6">
            <div className="flex flex-col items-center justify-center py-12">
              <GraduationCap className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-ink mb-2">No hay formación adicional registrada</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                La formación detallada se implementará en la siguiente fase (Candidatos 2.2).
              </p>
            </div>
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
                {documents.map((document) => (
                  <SiteCorpCard key={document.id} title={document.original_file_name}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileType className="h-4 w-4" />
                        <span>{getDocumentTypeName(document.document_type_id)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(document.created_at)}</span>
                      </div>
                      {document.description && (
                        <p className="text-sm text-ink">{document.description}</p>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(document.file_size)} • {document.mime_type || "—"}
                        </div>
                        <div className="flex gap-2">
                          <SiteCorpButton
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadDocument(document)}
                          >
                            <Download className="h-4 w-4" />
                          </SiteCorpButton>
                          {hasManagePermission && (
                            <SiteCorpButton
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDocument(document.id)}
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

          {/* Notas Tab */}
          <TabsContent value="notas" className="space-y-6">
            <div className="flex flex-col items-center justify-center py-12">
              <Notes className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-ink mb-2">No hay notas registradas</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Las notas internas se implementarán en la siguiente fase (Candidatos 2.2).
              </p>
            </div>
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
                value={selectedDocumentType}
                onValueChange={setSelectedDocumentType}
                options={documentTypes.map(t => ({ value: t.id, label: t.name }))}
                placeholder="Seleccione un tipo"
              />
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
    </div>
  )
}

export default CandidateDetail