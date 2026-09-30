import * as React from "react"
import {
  createDocumentTemplate,
  describeTemplateFileProblem,
  fetchDocumentTemplateTypes,
  uploadTemplateFile,
  analyzeAndStoreTemplateFile,
  type DocumentTemplateType,
  type DocumentTemplateTypeCode,
} from "@/lib/document-templates"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { showSuccess, showError } from "@/utils/toast"
import { FileUp, FileText, Rocket } from "lucide-react"

/**
 * Fase 11B.1 — Creación de una plantilla documental (§34/§83).
 *
 * Secuencia: se crea la plantilla y su versión 1 (backend) → se sube el DOCX
 * original → el analizador central verifica el contenido → se registra el análisis.
 */

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityId: string
  onCreated: (templateId: string) => void
}

const CreateDocumentTemplateDialog = ({ open, onOpenChange, entityId, onCreated }: Props) => {
  const [types, setTypes] = React.useState<DocumentTemplateType[]>([])
  const [documentTypeCode, setDocumentTypeCode] = React.useState<DocumentTemplateTypeCode | "">("")
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [effectiveFrom, setEffectiveFrom] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setDocumentTypeCode("")
    setName("")
    setDescription("")
    setEffectiveFrom("")
    setFile(null)
    setError(null)
    setProgress(null)
    fetchDocumentTemplateTypes()
      .then(setTypes)
      .catch(() => setError("No se pudieron cargar los tipos de plantilla."))
  }, [open])

  const handleFileChange = async (selected: File | null) => {
    setError(null)
    if (!selected) {
      setFile(null)
      return
    }
    const problem = await describeTemplateFileProblem(selected)
    if (problem) {
      setFile(null)
      setError(problem)
      return
    }
    setFile(selected)
  }

  const handleSubmit = async () => {
    setError(null)
    if (!documentTypeCode) {
      setError("Seleccione el tipo de documento de la plantilla.")
      return
    }
    if (!name.trim()) {
      setError("El nombre de la plantilla es obligatorio.")
      return
    }
    if (!file) {
      setError("Adjunte el archivo DOCX de la plantilla.")
      return
    }

    setSaving(true)
    try {
      setProgress("Creando la plantilla…")
      const created = await createDocumentTemplate({
        entityId,
        documentTypeCode,
        name: name.trim(),
        description: description.trim() || null,
        effectiveFrom: effectiveFrom || null,
      })

      setProgress("Subiendo el DOCX original…")
      const path = await uploadTemplateFile({
        entityId,
        templateId: created.template_id,
        version: {
          id: created.version_id,
          version_number: created.version_number,
          original_file_path: null,
          configured_file_path: null,
        },
        kind: "ORIGINAL",
        file,
      })

      setProgress("Analizando el contenido de la plantilla…")
      const analysis = await analyzeAndStoreTemplateFile(created.version_id, path)

      if (analysis.valid_docx) {
        showSuccess("Plantilla creada y analizada correctamente.")
      } else {
        showError("La plantilla se creó, pero el archivo no es un DOCX válido.")
      }
      onOpenChange(false)
      onCreated(created.template_id)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la plantilla."
      setError(message)
      showError(message)
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-sitecorp-primary" />
            Nueva plantilla documental
          </DialogTitle>
          <DialogDescription>
            La plantilla se crea como versión 1 en borrador: sólo podrá activarse cuando el
            contenido del DOCX sea válido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de documento *</Label>
            <SiteCorpSelect
              value={documentTypeCode}
              onValueChange={(value) => setDocumentTypeCode(value as DocumentTemplateTypeCode)}
              disabled={saving}
            >
              <option value="">Seleccionar tipo</option>
              {types.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </SiteCorpSelect>
          </div>

          <div className="space-y-2">
            <Label>Nombre de la plantilla *</Label>
            <SiteCorpInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej.: Contrato por tiempo determinado 2026"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <SiteCorpInput
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Uso previsto de esta plantilla (opcional)"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Fecha de vigencia inicial</Label>
            <SiteCorpInput
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Si se deja vacía, al activar la versión se tomará la fecha del día.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Archivo DOCX original *</Label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm">
              <span className="flex items-center gap-2 text-ink">
                <FileUp className="h-4 w-4 text-sitecorp-primary" />
                {file ? file.name : "Seleccionar archivo .docx"}
              </span>
              <span className="text-xs text-muted-foreground">Máx. 10 MB</span>
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={saving}
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              El archivo no se modifica. Escriba los marcadores como {"{{worker.full_name}}"}; puede
              consultarlos y copiarlos desde el detalle de la plantilla.
            </p>
          </div>

          {progress && <SiteCorpAlert type="info">{progress}</SiteCorpAlert>}
          {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <SiteCorpButton variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton onClick={handleSubmit} disabled={saving}>
              <Rocket className="mr-2 h-4 w-4" />
              {saving ? "Creando…" : "Crear plantilla"}
            </SiteCorpButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CreateDocumentTemplateDialog
