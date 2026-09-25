import * as React from "react"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { Users, Search, Edit3, Trash2, Plus, Upload } from "lucide-react"
import { SelectItem } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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

interface Province {
  id: string
  name: string
}

interface Municipality {
  id: string
  name: string
}

interface CandidateFormData {
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
  political_affiliation: "",
  is_retired_or_rehired: "",
  has_disciplinary_measures: false,
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

const EntityCandidates = () => {
  const { currentEntity } = useCurrentEntity()
  const entityId = currentEntity?.id

  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [genders, setGenders] = React.useState<Gender[]>([])
  const [maritalStatuses, setMaritalStatuses] = React.useState<MaritalStatus[]>([])
  const [educationLevels, setEducationLevels] = React.useState<EducationLevel[]>([])
  const [provinces, setProvinces] = React.useState<Province[]>([])
  const [municipalities, setMunicipalities] = React.useState<Municipality[]>([])

  const [searchTerm, setSearchTerm] = React.useState("")
  const [selectedGender, setSelectedGender] = React.useState<string | null>(null)
  const [selectedMaritalStatus, setSelectedMaritalStatus] = React.useState<string | null>(null)
  const [selectedEducationLevel, setSelectedEducationLevel] = React.useState<string | null>(null)
  const [selectedSpecialty, setSelectedSpecialty] = React.useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = React.useState<string | null>(null)

  const [page, setPage] = React.useState(1)
  const [rowsPerPage, setRowsPerPage] = React.useState(10)
  const [totalRows, setTotalRows] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Form state
  const [formOpen, setFormOpen] = React.useState(false)
  const [formData, setFormData] = React.useState<CandidateFormData>(emptyFormData)
  const [formSubmitting, setFormSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [formSuccess, setFormSuccess] = React.useState(false)

  // Disciplinary measures dialog
  const [disciplinaryDialogOpen, setDisciplinaryDialogOpen] = React.useState(false)
  const [disciplinaryDocument, setDisciplinaryDocument] = React.useState<File | null>(null)
  const [disciplinaryUploading, setDisciplinaryUploading] = React.useState(false)

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

        // Set provinces from Cuba list
        setProvinces(CUBA_PROVINCES.map(name => ({ id: name, name })))
      } catch (err) {
        console.error("Error fetching reference data:", err)
        setError("Error al cargar datos de referencia")
      }
    }

    if (entityId) {
      fetchReferenceData()
    }
  }, [entityId])

  // Fetch candidates
  React.useEffect(() => {
    const fetchCandidates = async () => {
      if (!entityId) {
        setCandidates([])
        setTotalRows(0)
        return
      }

      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from("candidates")
          .select("*", { count: "exact" })
          .eq("organization_entity_id", entityId)

        // Apply search
        if (searchTerm.trim()) {
          const search = searchTerm.trim().toLowerCase()
          query = query.or(
            `first_name.ilike.%${search}%,first_surname.ilike.%${search}%,second_surname.ilike.%${search}%,identification.ilike.%${search}%`
          )
        }

        // Apply filters
        if (selectedGender) {
          query = query.eq("gender_id", selectedGender)
        }
        if (selectedMaritalStatus) {
          query = query.eq("marital_status_id", selectedMaritalStatus)
        }
        if (selectedEducationLevel) {
          query = query.eq("education_level_id", selectedEducationLevel)
        }
        if (selectedSpecialty) {
          query = query.eq("specialty", selectedSpecialty)
        }
        if (selectedStatus) {
          query = query.eq("status", selectedStatus)
        }

        // Apply pagination
        const from = (page - 1) * rowsPerPage
        const to = from + rowsPerPage - 1
        query = query.range(from, to).order("created_at", { ascending: false })

        const { data, error, count } = await query

        if (error) throw error
        setCandidates(data || [])
        setTotalRows(count || 0)
      } catch (err) {
        console.error("Error fetching candidates:", err)
        setError("Error al cargar los candidatos")
        setCandidates([])
        setTotalRows(0)
      } finally {
        setLoading(false)
      }
    }

    if (entityId) {
      fetchCandidates()
    }
  }, [
    entityId,
    searchTerm,
    selectedGender,
    selectedMaritalStatus,
    selectedEducationLevel,
    selectedSpecialty,
    selectedStatus,
    page,
    rowsPerPage
  ])

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1)
  }, [
    searchTerm,
    selectedGender,
    selectedMaritalStatus,
    selectedEducationLevel,
    selectedSpecialty,
    selectedStatus
  ])

  // Form handlers
  const handleFormChange = (field: keyof CandidateFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // DNI autocomplete for birth date (Cuban DNI format: first 6 digits = aammdd)
    const handleIdentificationChange = (value: string) => {
      const cleaned = value.replace(/\D/g, "")
      setFormData(prev => ({ ...prev, identification: cleaned }))
  
      // Auto-fill birth date from first 6 digits (aammdd) and display as dd/mm/yyyy
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

  // Province change - reset municipality
  const handleProvinceChange = (province: string) => {
    setFormData(prev => ({ ...prev, province, municipality: "" }))
    setMunicipalities([])

    if (province && MUNICIPIOS_BY_PROVINCE[province]) {
      setMunicipalities(MUNICIPIOS_BY_PROVINCE[province].map(name => ({ id: name, name })))
    }
  }

  // Disciplinary measures upload
  const handleDisciplinaryUpload = async () => {
    if (!disciplinaryDocument) return

    setDisciplinaryUploading(true)
    try {
      const file = disciplinaryDocument
      const fileName = `disciplinary_${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file)

      if (uploadError) throw uploadError

      setDisciplinaryDialogOpen(false)
      setDisciplinaryDocument(null)
      setFormSuccess(true)
      setTimeout(() => setFormSuccess(false), 3000)
    } catch (err) {
      console.error("Error uploading document:", err)
      setFormError("Error al subir el documento disciplinario")
    } finally {
      setDisciplinaryUploading(false)
    }
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
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

    // Validar especialidad para niveles que la requieren
        if (formData.education_level_id) {
          const educationLevel = educationLevels.find(level => level.id === formData.education_level_id)
          const requiresSpecialty = ["Técnico", "Obrero"].includes(educationLevel?.name || "")
          if (requiresSpecialty && !formData.specialty.trim()) {
            setFormError(`La especialidad es obligatoria para ${educationLevel?.name}`)
            return
          }
        }

    // Validar formato de email si se proporciona
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
      // Verificar si ya existe un candidato con la misma identificación
      const { data: existingCandidates, error: checkError } = await supabase
        .from("candidates")
        .select("id")
        .eq("organization_entity_id", entityId)
        .eq("identification", formData.identification.trim())

      if (checkError) throw checkError

      if (existingCandidates && existingCandidates.length > 0) {
        // Mostrar advertencia pero no bloquear
        setFormError(`Advertencia: Ya existe un candidato con la identificación ${formData.identification.trim()}. ¿Desea continuar de todos modos?`)
        // Continuar con el guardado
      }

      const newCandidate = {
              tenant_id: currentEntity?.tenant_id,
              organization_entity_id: entityId,
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
              status: "active" as const,
            }

      const { error: insertError } = await supabase
        .from("candidates")
        .insert(newCandidate)

      if (insertError) throw insertError

      // Reset form and close
      setFormData(emptyFormData)
      setFormSuccess(true)
      setFormOpen(false)

      // Refresh candidates list
      setTimeout(() => setFormSuccess(false), 3000)
    } catch (err) {
      console.error("Error creating candidate:", err)
      setFormError("Error al guardar el candidato. Inténtalo de nuevo.")
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleFormCancel = () => {
    setFormData(emptyFormData)
    setFormError(null)
    setFormOpen(false)
  }

  if (!entityId) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Candidatos"
          description="Gestión de candidatos y procesos de selección"
        />
        <SiteCorpAlert type="info">
          Seleccione una entidad para ver sus candidatos
        </SiteCorpAlert>
      </div>
    )
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  const handleResetFilters = () => {
    setSearchTerm("")
    setSelectedGender(null)
    setSelectedMaritalStatus(null)
    setSelectedEducationLevel(null)
    setSelectedSpecialty(null)
    setSelectedStatus(null)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerPage(parseInt(e.target.value))
    setPage(1)
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Candidatos"
          description="Gestión de candidatos y procesos de selección"
        />
        <SiteCorpLoading rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Candidatos"
          description="Gestión de candidatos y procesos de selección"
        />
        <SiteCorpAlert type="danger">{error}</SiteCorpAlert>
      </div>
    )
  }

  const totalPages = Math.ceil(totalRows / rowsPerPage)

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <SiteCorpPageHeader
          title="Candidatos"
          description={`Listado de candidatos para ${currentEntity?.name}`}
        />
        <SiteCorpButton onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo candidato
        </SiteCorpButton>
      </div>

      {/* Success alert */}
      {formSuccess && (
        <SiteCorpAlert type="success">
          Candidato creado exitosamente
        </SiteCorpAlert>
      )}

      {/* Search and Filters */}
      <SiteCorpCard>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            {/* Search */}
            <div>
              <label className="text-sm font-medium text-ink">Buscar</label>
              <SiteCorpInput
                type="text"
                placeholder="Nombre, apellidos o identificación"
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>

            {/* Gender filter */}
                        <div>
                          <label className="text-sm font-medium text-ink">Sexo</label>
                          <SiteCorpSelect
                            value={selectedGender || undefined}
                            onValueChange={(value) => setSelectedGender(value === "__placeholder__" ? null : value)}
                          >
                            <SelectItem value="__placeholder__">
                              Todas
                            </SelectItem>
                            {genders.map(gender => (
                              <SelectItem
                                key={gender.id}
                                value={gender.id}
                              >
                                {gender.name}
                              </SelectItem>
                            ))}
                          </SiteCorpSelect>
                        </div>

            {/* Marital status filter */}
                        <div>
                          <label className="text-sm font-medium text-ink">Estado civil</label>
                          <SiteCorpSelect
                            value={selectedMaritalStatus || undefined}
                            onValueChange={(value) => setSelectedMaritalStatus(value === "__placeholder__" ? null : value)}
                          >
                            <SelectItem value="__placeholder__">
                              Todos
                            </SelectItem>
                            {maritalStatuses.map(status => (
                              <SelectItem
                                key={status.id}
                                value={status.id}
                              >
                                {status.name}
                              </SelectItem>
                            ))}
                          </SiteCorpSelect>
                        </div>

            {/* Education level filter */}
                                    <div>
                                      <label className="text-sm font-medium text-ink">Nivel educacional</label>
                                      <SiteCorpSelect
                                        value={selectedEducationLevel || undefined}
                                        onValueChange={(value) => setSelectedEducationLevel(value === "__placeholder__" ? null : value)}
                                      >
                                        <SelectItem value="__placeholder__">
                                          Todos
                                        </SelectItem>
                                        {educationLevels
                                                                      .filter(level => ["Primaria", "Secundaria", "Obrero", "Técnico", "Bachiller", "Superior"].includes(level.name))
                                                                      .map(level => (
                                                                        <SelectItem
                                                                          key={level.id}
                                                                          value={level.id}
                                                                        >
                                                                          {level.name}
                                                                        </SelectItem>
                                                                      ))}
                                      </SiteCorpSelect>
                                    </div>

            {/* Specialty filter */}
            <div>
              <label className="text-sm font-medium text-ink">Especialidad</label>
              <SiteCorpInput
                type="text"
                placeholder="Especialidad"
                value={selectedSpecialty || ""}
                onChange={(e) => setSelectedSpecialty(e.target.value || null)}
              />
            </div>

            {/* Status filter */}
                        <div>
                          <label className="text-sm font-medium text-ink">Estado</label>
                          <SiteCorpSelect
                            value={selectedStatus || undefined}
                            onValueChange={(value) => setSelectedStatus(value === "__placeholder__" ? null : value)}
                          >
                            <SelectItem value="__placeholder__">
                              Todos
                            </SelectItem>
                            <SelectItem value="active">
                              Activo
                            </SelectItem>
                            <SelectItem value="archived">
                              Archivado
                            </SelectItem>
                          </SiteCorpSelect>
                        </div>

            {/* Actions */}
            <div className="flex items-end">
              <SiteCorpButton
                variant="outline"
                onClick={handleResetFilters}
                size="sm"
              >
                <Search className="mr-1 h-3 w-3" /> Limpiar
              </SiteCorpButton>
            </div>
          </div>
        </div>
      </SiteCorpCard>

      {/* Candidates Table */}
      {candidates.length === 0 ? (
        <SiteCorpCard>
          <SiteCorpAlert type="info">
            No se encontraron candidatos con los criterios especificados
          </SiteCorpAlert>
        </SiteCorpCard>
      ) : (
        <>
          <SiteCorpCard>
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Nombre</TableHead>
                    <TableHead className="w-20">Primer apellido</TableHead>
                    <TableHead className="w-20">Segundo apellido</TableHead>
                    <TableHead className="w-20">Identificación</TableHead>
                    <TableHead className="w-16">Sexo</TableHead>
                    <TableHead className="w-20">Nivel educacional</TableHead>
                    <TableHead className="w-20">Especialidad</TableHead>
                    <TableHead className="w-16">Teléfono</TableHead>
                    <TableHead className="w-16">Estado</TableHead>
                    <TableHead className="w-20">Fecha registro</TableHead>
                    <TableHead className="w-16">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sitecorp-primary/10">
                            <Users className="h-4 w-4 text-sitecorp-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-ink">
                              {candidate.first_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {candidate.first_surname} {candidate.second_surname || ""}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">{candidate.first_surname}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">{candidate.second_surname || "-"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-ink">{candidate.identification}</p>
                      </TableCell>
                      <TableCell>
                        {candidate.gender_id ? (
                          <p className="text-sm text-muted-foreground">
                            {genders.find(g => g.id === candidate.gender_id)?.name || "Desconocido"}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">-</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {candidate.education_level_id ? (
                          <p className="text-sm text-muted-foreground">
                            {educationLevels.find(e => e.id === candidate.education_level_id)?.name || "Desconocido"}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">-</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">{candidate.specialty || "-"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">{candidate.phone || "-"}</p>
                      </TableCell>
                      <TableCell>
                        <SiteCorpStatusBadge
                          status={candidate.status === "active" ? "success" : "neutral"}
                        >
                          {candidate.status === "active" ? "Activo" : "Archivado"}
                        </SiteCorpStatusBadge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">
                          {new Date(candidate.created_at).toLocaleDateString("es-ES")}
                        </p>
                      </TableCell>
                      <TableCell className="flex items-center gap-2">
                        <SiteCorpButton
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            console.log("Edit candidate:", candidate.id)
                          }}
                        >
                          <Edit3 className="mr-1 h-3 w-3" />
                        </SiteCorpButton>
                        <SiteCorpButton
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            console.log("Archive candidate:", candidate.id)
                          }}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                        </SiteCorpButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SiteCorpCard>

          {/* Pagination */}
          <div className="flex justify-center mt-6">
            <Pagination>
              <PaginationContent>
                {totalPages > 0 && (
                  <>
                    <PaginationPrevious
                      onClick={() => handlePageChange(Math.max(1, page - 1))}
                    />
                    {page > 3 && (
                      <>
                        <PaginationItem>
                          <PaginationLink
                            isActive={false}
                            onClick={() => handlePageChange(1)}
                          >
                            1
                          </PaginationLink>
                        </PaginationItem>
                        <PaginationEllipsis />
                      </>
                    )}
                    {page > 2 && (
                      <PaginationItem>
                        <PaginationLink
                          isActive={false}
                          onClick={() => handlePageChange(page - 1)}
                        >
                          {page - 1}
                        </PaginationLink>
                      </PaginationItem>
                    )}
                    <PaginationItem>
                      <PaginationLink
                        isActive={true}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                    {page < totalPages - 1 && (
                      <PaginationItem>
                        <PaginationLink
                          isActive={false}
                          onClick={() => handlePageChange(page + 1)}
                        >
                          {page + 1}
                        </PaginationLink>
                      </PaginationItem>
                    )}
                    {page < totalPages - 2 && (
                      <>
                        <PaginationEllipsis />
                        <PaginationItem>
                          <PaginationLink
                            isActive={false}
                            onClick={() => handlePageChange(totalPages)}
                          >
                            {totalPages}
                          </PaginationLink>
                        </PaginationItem>
                      </>
                    )}
                    <PaginationNext
                      onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                    />
                  </>
                )}
              </PaginationContent>
            </Pagination>
          </div>

          {/* Info bar */}
          <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
            <p>
              Mostrando {candidates.length} de {totalRows} candidatos
            </p>
            <div className="flex items-center gap-4">
              <label>
                Filas por página:
                <select
                  value={rowsPerPage}
                  onChange={handleRowsPerPageChange}
                  className="ml-2 SiteCorpInput"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
          </div>
        </>
      )}

      {/* New Candidate Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => {
        if (!open) handleFormCancel()
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo candidato</DialogTitle>
            <DialogDescription>
              Complete los datos del candidato. Los campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-6">
            {/* Section 1: Identificación */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink border-b pb-2">Identificación</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nombre *</Label>
                  <SiteCorpInput
                    type="text"
                    placeholder="Nombre"
                    value={formData.first_name}
                    onChange={(e) => handleFormChange("first_name", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Primer apellido *</Label>
                  <SiteCorpInput
                    type="text"
                    placeholder="Primer apellido"
                    value={formData.first_surname}
                    onChange={(e) => handleFormChange("first_surname", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Segundo apellido</Label>
                  <SiteCorpInput
                    type="text"
                    placeholder="Segundo apellido"
                    value={formData.second_surname}
                    onChange={(e) => handleFormChange("second_surname", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                                  <Label>Identificación *</Label>
                                  <SiteCorpInput
                                    type="text"
                                    placeholder="Cédula / DNI / Pasaporte"
                                    value={formData.identification}
                                    onChange={(e) => handleIdentificationChange(e.target.value)}
                                    required
                                  />
                                </div>
                <div className="space-y-1.5">
                                  <Label>Fecha de nacimiento (dd/mm/aaaa)</Label>
                                  <SiteCorpInput
                                    type="text"
                                    placeholder="dd/mm/aaaa"
                                    value={formData.birth_date}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, "").substring(0, 8)
                                      let formatted = val
                                      if (val.length > 4) formatted = `${val.substring(0, 2)}/${val.substring(2, 4)}/${val.substring(4, 8)}`
                                      else if (val.length > 2) formatted = `${val.substring(0, 2)}/${val.substring(2)}`
                                      handleFormChange("birth_date", formatted)
                                    }}
                                  />
                                </div>
                <div className="space-y-1.5">
                                  <Label>Sexo</Label>
                                  <SiteCorpSelect
                                    value={formData.gender_id || undefined}
                                    onValueChange={(value) => handleFormChange("gender_id", value === "__placeholder__" ? "" : value)}
                                  >
                                    <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                                    {genders.map(gender => (
                                      <SelectItem key={gender.id} value={gender.id}>
                                        {gender.name}
                                      </SelectItem>
                                    ))}
                                  </SiteCorpSelect>
                                </div>
              </div>
            </div>

            {/* Section 2: Datos personales */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-ink border-b pb-2">Datos personales</h3>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>Estado civil</Label>
                              <SiteCorpSelect
                                value={formData.marital_status_id || undefined}
                                onValueChange={(value) => handleFormChange("marital_status_id", value === "__placeholder__" ? "" : value)}
                              >
                                <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                                {maritalStatuses.map(status => (
                                  <SelectItem key={status.id} value={status.id}>
                                    {status.name}
                                  </SelectItem>
                                ))}
                              </SiteCorpSelect>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Afiliación política</Label>
                              <SiteCorpSelect
                                value={formData.political_affiliation || undefined}
                                onValueChange={(value) => handleFormChange("political_affiliation", value === "__placeholder__" ? "" : value)}
                              >
                                <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                                {POLITICAL_AFFILIATIONS.map(aff => (
                                  <SelectItem key={aff.id} value={aff.id}>
                                    {aff.name}
                                  </SelectItem>
                                ))}
                              </SiteCorpSelect>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Retirado o Recontratado</Label>
                              <SiteCorpSelect
                                value={formData.is_retired_or_rehired || undefined}
                                onValueChange={(value) => handleFormChange("is_retired_or_rehired", value === "__placeholder__" ? "" : value)}
                              >
                                <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                                {RETIRED_REHIRED_OPTIONS.map(opt => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    {opt.name}
                                  </SelectItem>
                                ))}
                              </SiteCorpSelect>
                            </div>
                          </div>
                        </div>

            {/* Section 3: Contacto y dirección */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-ink border-b pb-2">Contacto y dirección</h3>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>Teléfono</Label>
                              <SiteCorpInput
                                type="tel"
                                placeholder="+51 999 999 999"
                                value={formData.phone}
                                onChange={(e) => handleFormChange("phone", e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Email</Label>
                              <SiteCorpInput
                                type="email"
                                placeholder="correo@ejemplo.com"
                                value={formData.email}
                                onChange={(e) => handleFormChange("email", e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label>Dirección</Label>
                              <Textarea
                                placeholder="Dirección completa"
                                value={formData.address}
                                onChange={(e) => handleFormChange("address", e.target.value)}
                                rows={2}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Provincia</Label>
                              <SiteCorpSelect
                                value={formData.province || undefined}
                                onValueChange={(value) => handleProvinceChange(value === "__placeholder__" ? "" : value)}
                              >
                                <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                                {provinces.map(province => (
                                  <SelectItem key={province.id} value={province.id}>
                                    {province.name}
                                  </SelectItem>
                                ))}
                              </SiteCorpSelect>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Municipio</Label>
                              <SiteCorpSelect
                                value={formData.municipality || undefined}
                                onValueChange={(value) => handleFormChange("municipality", value === "__placeholder__" ? "" : value)}
                                disabled={!formData.province}
                              >
                                <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                                {municipalities.map(muni => (
                                  <SelectItem key={muni.id} value={muni.id}>
                                    {muni.name}
                                  </SelectItem>
                                ))}
                              </SiteCorpSelect>
                            </div>
                          </div>
                        </div>

            {/* Section 4: Formación */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-ink border-b pb-2">Formación</h3>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>Nivel educacional</Label>
                              <SiteCorpSelect
                                value={formData.education_level_id || undefined}
                                onValueChange={(value) => handleFormChange("education_level_id", value === "__placeholder__" ? "" : value)}
                              >
                                <SelectItem value="__placeholder__">Seleccionar...</SelectItem>
                                {educationLevels
                                                                  .filter(level => ["Primaria", "Secundaria", "Obrero", "Técnico", "Bachiller", "Superior"].includes(level.name))
                                                                  .map(level => (
                                                                    <SelectItem key={level.id} value={level.id}>
                                                                      {level.name}
                                                                    </SelectItem>
                                                                  ))}
                              </SiteCorpSelect>
                            </div>
                            {(formData.education_level_id && (() => {
                                                          const level = educationLevels.find(l => l.id === formData.education_level_id)
                                                          return level?.name === "Técnico" || level?.name === "Obrero"
                                                        })()) && (
                              <div className="space-y-1.5">
                                <Label>Especialidad *</Label>
                                <SiteCorpInput
                                  type="text"
                                  placeholder="Especialidad"
                                  value={formData.specialty}
                                  onChange={(e) => handleFormChange("specialty", e.target.value)}
                                  required
                                />
                              </div>
                            )}
                          </div>
                        </div>

            {/* Section 5: Medidas disciplinarias */}
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
                          {formData.has_disciplinary_measures && (
                            <SiteCorpButton
                              type="button"
                              variant="outline"
                              onClick={() => setDisciplinaryDialogOpen(true)}
                              className="mt-2"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Subir documento disciplinario
                            </SiteCorpButton>
                          )}
                        </div>
            
                        {/* Form error */}
                        {formError && (
                          <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>
                        )}

            {/* Form footer */}
            <DialogFooter className="gap-2">
              <SiteCorpButton
                type="button"
                variant="outline"
                onClick={handleFormCancel}
                disabled={formSubmitting}
              >
                Cancelar
              </SiteCorpButton>
              <SiteCorpButton
                type="submit"
                disabled={formSubmitting}
              >
                {formSubmitting ? "Guardando..." : "Guardar candidato"}
              </SiteCorpButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EntityCandidates
