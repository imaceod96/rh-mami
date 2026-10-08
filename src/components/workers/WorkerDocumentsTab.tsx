import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Download, Eye, FileText, Paperclip, Trash2, Upload } from "lucide-react"
import { showError, showSuccess } from "@/utils/toast"
import {
  DOCUMENT_ACCEPT_ATTR,
  formatDocumentDate,
  formatFileSize,
  isViewableDocument,
  sanitizeFileName,
  validateDocumentFile,
} from "@/lib/documents"

interface WorkerDocument {
  id: string
  worker_id: string
  document_type_id: string
  employment_contract_id: string | null
  file_name: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  description: string | null
  source: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

interface DocumentType {
  id: string
  name: string
  sort_order: number | null
}

interface ContractRef {
  id: string
  start_date: string
  contract_type: { name: string } | null
}

interface WorkerDocumentsTabProps {
  workerId: string
  canManage: boolean
}

const BUCKET = "documents"

export const WorkerDocumentsTab: React.FC<WorkerDocumentsTabProps> = ({ workerId, canManage }) => {
  const [documents, setDocuments] = React.useState<WorkerDocument[]>([])
  const [documentTypes, setDocumentTypes] = React.useState<DocumentType[]>([])
  const [uploaderNames, setUploaderNames] = React.useState<Record<string, string>>({})
  const [contractsById, setContractsById] = React.useState<Record<string, ContractRef>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [selectedType, setSelectedType] = React.useState("")
  const [description, setDescription] = React.useState("")

  const loadDocuments = React.useCallback(async () => {
    if (!workerId) return
    setLoading(true)
    setError(null)
    try {
      const [typesRes, docsRes] = await Promise.all([
        supabase
          .from("document_types")
          .select("id, name, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("worker_documents")
          .select("*")
          .eq("worker_id", workerId)
          .order("created_at", { ascending: false }),
      ])
      if (typesRes.error) throw typesRes.error
      if (docsRes.error) throw docsRes.error

      setDocumentTypes((typesRes.data as DocumentType[]) || [])
      const docs = (docsRes.data as WorkerDocument[]) || []
      setDocuments(docs)

      // Resolver nombres de quienes subieron (best-effort, sujeto a RLS de profiles)
      const uploaderIds = Array.from(
        new Set(docs.map((d) => d.uploaded_by).filter((id): id is string => !!id))
      )
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", uploaderIds)
        const map: Record<string, string> = {}
        ;(profiles || []).forEach((p: { id: string; full_name: string | null; username: string | null }) => {
          map[p.id] = p.full_name || p.username || ""
        })
        setUploaderNames(map)
      } else {
        setUploaderNames({})
      }

      // Referencia opcional a contratos laborales (documentos generados en el futuro)
      const contractIds = Array.from(
        new Set(docs.map((d) => d.employment_contract_id).filter((id): id is string => !!id))
      )
      if (contractIds.length > 0) {
        const { data: contracts } = await supabase
          .from("employment_contracts")
          .select("id, start_date, contract_type:employment_contract_types(name)")
          .in("id", contractIds)
        const map: Record<string, ContractRef> = {}
        ;(contracts || []).forEach((c: { id: string; start_date: string; contract_type: { name: string } | { name: string }[] | null }) => {
          map[c.id] = {
            id: c.id,
            start_date: c.start_date,
            contract_type: Array.isArray(c.contract_type) ? c.contract_type[0] || null : c.contract_type,
          }
        })
        setContractsById(map)
      } else {
        setContractsById({})
      }
    } catch (err) {
      console.error("Error loading worker documents:", err)
      setError(err instanceof Error ? err.message : "Error al cargar los documentos")
    } finally {
      setLoading(false)
    }
  }, [workerId])

  React.useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const typeName = (id: string) => documentTypes.find((t) => t.id === id)?.name || "—"

  const openUploadDialog = () => {
    setUploadError(null)
    setSelectedFile(null)
    setSelectedType("")
    setDescription("")
    setUploadDialogOpen(true)
  }

  const handleUpload = async () => {
    if (!selectedFile || !selectedType) return

    const validationError = validateDocumentFile(selectedFile)
    if (validationError) {
      setUploadError(validationError)
      return
    }

    setUploading(true)
    setUploadError(null)

    const documentId = crypto.randomUUID()
    const storagePath = `workers/${workerId}/${documentId}/${sanitizeFileName(selectedFile.name)}`

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error("Usuario no autenticado")

      // 1) Subir a Storage privado
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, selectedFile, { cacheControl: "3600", upsert: false })
      if (storageError) throw storageError

      // 2) Crear el registro. Si falla, limpiar el archivo para no dejar huérfanos.
      const { error: dbError } = await supabase.from("worker_documents").insert({
        id: documentId,
        worker_id: workerId,
        document_type_id: selectedType,
        file_name: selectedFile.name,
        storage_path: storagePath,
        mime_type: selectedFile.type || null,
        file_size: selectedFile.size,
        description: description.trim() || null,
        source: "MANUAL",
        uploaded_by: userData.user.id,
      })
      if (dbError) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw dbError
      }

      setUploadDialogOpen(false)
      setSelectedFile(null)
      setSelectedType("")
      setDescription("")
      await loadDocuments()
      showSuccess("Documento subido correctamente")
    } catch (err) {
      console.error("Error uploading worker document:", err)
      setUploadError(err instanceof Error ? err.message : "Error al subir el documento")
    } finally {
      setUploading(false)
    }
  }

  const handleView = async (doc: WorkerDocument) => {
    setBusyId(doc.id)
    try {
      const { data, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storage_path, 60)
      if (signedError) throw signedError
      window.open(data.signedUrl, "_blank", "noopener,noreferrer")
    } catch (err) {
      console.error("Error viewing document:", err)
      showError("No se pudo abrir el documento")
    } finally {
      setBusyId(null)
    }
  }

  const handleDownload = async (doc: WorkerDocument) => {
    setBusyId(doc.id)
    try {
      const { data, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(doc.storage_path)
      if (downloadError) throw downloadError

      const url = window.URL.createObjectURL(data)
      const a = window.document.createElement("a")
      a.href = url
      a.download = doc.file_name
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
    } catch (err) {
      console.error("Error downloading document:", err)
      showError("No se pudo descargar el documento")
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (doc: WorkerDocument) => {
    if (!confirm("¿Está seguro de que desea eliminar este documento? Esta acción no se puede deshacer.")) {
      return
    }
    setBusyId(doc.id)
    try {
      // Eliminar primero el archivo (evita archivos huérfanos) y luego el registro
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path])
      if (storageError) throw storageError

      const { error: dbError } = await supabase.from("worker_documents").delete().eq("id", doc.id)
      if (dbError) throw dbError

      await loadDocuments()
      showSuccess("Documento eliminado correctamente")
    } catch (err) {
      console.error("Error deleting worker document:", err)
      showError("No se pudo eliminar el documento")
    } finally {
      setBusyId(null)
    }
  }

  const uploaderLabel = (id: string | null) => {
    if (!id) return "—"
    return uploaderNames[id] || "—"
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink">Documentos</h3>
          <p className="text-sm text-muted-foreground">
            Expediente documental del trabajador
            {!loading && documents.length > 0 ? ` · ${documents.length} documento(s)` : ""}
          </p>
        </div>
        {canManage && (
          <SiteCorpButton type="button" onClick={openUploadDialog}>
            <Upload className="mr-2 h-4 w-4" /> Añadir documento
          </SiteCorpButton>
        )}
      </div>

      {loading ? (
        <SiteCorpAlert type="info">Cargando documentos...</SiteCorpAlert>
      ) : error ? (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
          <Paperclip className="mb-4 h-12 w-12 text-muted-foreground" />
          <h4 className="mb-1 text-base font-semibold text-ink">
            Este trabajador todavía no tiene documentos.
          </h4>
          <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
            {canManage
              ? "Añada documentos al expediente de este trabajador."
              : "No se han subido documentos para este trabajador."}
          </p>
          {canManage && (
            <SiteCorpButton type="button" onClick={openUploadDialog}>
              <Upload className="mr-2 h-4 w-4" /> Añadir documento
            </SiteCorpButton>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const viewable = isViewableDocument(doc.mime_type, doc.file_name)
            const contract = doc.employment_contract_id
              ? contractsById[doc.employment_contract_id]
              : null
            const isBusy = busyId === doc.id
            return (
              <SiteCorpCard key={doc.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="break-all font-medium text-ink">{doc.file_name}</span>
                      {doc.source === "GENERATED" && (
                        <SiteCorpStatusBadge status="info">Generado</SiteCorpStatusBadge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Tipo: {typeName(doc.document_type_id)}</span>
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>Subido: {formatDocumentDate(doc.created_at)}</span>
                      <span>Por: {uploaderLabel(doc.uploaded_by)}</span>
                    </div>
                    {doc.description && <p className="text-sm text-ink">{doc.description}</p>}
                    {contract && (
                      <p className="text-xs text-muted-foreground">
                        Contrato: {contract.contract_type?.name || "Contrato laboral"} · Inicio:{" "}
                        {formatDocumentDate(contract.start_date)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {viewable && (
                      <SiteCorpButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleView(doc)}
                        aria-label="Ver documento"
                      >
                        <Eye className="h-4 w-4" />
                      </SiteCorpButton>
                    )}
                    <SiteCorpButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => handleDownload(doc)}
                      aria-label="Descargar documento"
                    >
                      <Download className="h-4 w-4" />
                    </SiteCorpButton>
                    {canManage && (
                      <SiteCorpButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleDelete(doc)}
                        aria-label="Eliminar documento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </SiteCorpButton>
                    )}
                  </div>
                </div>
              </SiteCorpCard>
            )
          })}
        </div>
      )}

      {/* Diálogo de carga */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Añadir documento</DialogTitle>
            <DialogDescription>
              Seleccione el tipo de documento y cargue el archivo al expediente del trabajador.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {uploadError && <SiteCorpAlert type="danger">{uploadError}</SiteCorpAlert>}

            <div className="space-y-2">
              <Label>Tipo de documento *</Label>
              <SiteCorpSelect value={selectedType} onValueChange={setSelectedType}>
                <option value="">Seleccione un tipo</option>
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SiteCorpSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="worker-doc-file">Archivo *</Label>
              <input
                type="file"
                id="worker-doc-file"
                accept={DOCUMENT_ACCEPT_ATTR}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-sitecorp-primary file:px-4 file:py-1 file:text-white hover:file:bg-sitecorp-primary-dark"
              />
              <p className="text-xs text-muted-foreground">
                Formatos permitidos: PDF, DOC, DOCX, JPG, JPEG, PNG (máx. 10 MB).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="worker-doc-description">Descripción (opcional)</Label>
              <SiteCorpInput
                id="worker-doc-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción del documento"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SiteCorpButton
              type="button"
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={uploading}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton
              type="button"
              onClick={handleUpload}
              disabled={uploading || !selectedFile || !selectedType}
            >
              {uploading ? "Subiendo..." : "Subir documento"}
            </SiteCorpButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WorkerDocumentsTab
