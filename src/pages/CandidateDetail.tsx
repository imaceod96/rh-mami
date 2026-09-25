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
import { Users, Edit3, ArrowLeft, FileText, Briefcase, GraduationCap, Paperclip, FileText as Notes } from "lucide-react"

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

const CandidateDetail = () => {
  const { entityId, candidateId } = useParams<{ entityId: string; candidateId: string }>()
  const navigate = useNavigate()
  const { currentEntity } = useCurrentEntity()

  const [candidate, setCandidate] = React.useState<Candidate | null>(null)
  const [genders, setGenders] = React.useState<Gender[]>([])
  const [maritalStatuses, setMaritalStatuses] = React.useState<MaritalStatus[]>([])
  const [educationLevels, setEducationLevels] = React.useState<EducationLevel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [hasViewPermission, setHasViewPermission] = React.useState(false)
  const [hasManagePermission, setHasManagePermission] = React.useState(false)

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
            <div className="flex flex-col items-center justify-center py-12">
              <Paperclip className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-ink mb-2">No hay documentos registrados</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                La gestión de documentos se implementará en la siguiente fase (Candidatos 2.2).
              </p>
            </div>
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
    </div>
  )
}

export default CandidateDetail