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
import { Users, Search, Edit3, Trash2, Plus } from "lucide-react"
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
}

const EntityCandidates = () => {
  const { currentEntity } = useCurrentEntity()
  const entityId = currentEntity?.id

  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [genders, setGenders] = React.useState<Gender[]>([])
  const [maritalStatuses, setMaritalStatuses] = React.useState<MaritalStatus[]>([])
  const [educationLevels, setEducationLevels] = React.useState<EducationLevel[]>([])

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
  const handleFormChange = (field: keyof CandidateFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
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

    // Validar especialidad solo para Técnico/Profesional
    if (formData.education_level_id) {
      const educationLevel = educationLevels.find(level => level.id === formData.education_level_id)
      if (educationLevel?.name === "Técnico/Profesional" && !formData.specialty.trim()) {
        setFormError("La especialidad es obligatoria para Técnico/Profesional")
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
                            {educationLevels.map(level => (
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
                    onChange={(e) => handleFormChange("identification", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha de nacimiento</Label>
                  <SiteCorpInput
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => handleFormChange("birth_date", e.target.value)}
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
                  <Label>Municipio</Label>
                  <SiteCorpInput
                    type="text"
                    placeholder="Municipio"
                    value={formData.municipality}
                    onChange={(e) => handleFormChange("municipality", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Provincia</Label>
                  <SiteCorpInput
                    type="text"
                    placeholder="Provincia"
                    value={formData.province}
                    onChange={(e) => handleFormChange("province", e.target.value)}
                  />
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
                                    {educationLevels.map(level => (
                                      <SelectItem key={level.id} value={level.id}>
                                        {level.name}
                                      </SelectItem>
                                    ))}
                                  </SiteCorpSelect>
                                </div>
                <div className="space-y-1.5">
                  <Label>Especialidad</Label>
                  <SiteCorpInput
                    type="text"
                    placeholder="Especialidad"
                    value={formData.specialty}
                    onChange={(e) => handleFormChange("specialty", e.target.value)}
                  />
                </div>
              </div>
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
