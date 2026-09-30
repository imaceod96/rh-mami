import * as React from "react"
import { formatDocumentDate } from "@/lib/document-variables"
import {
  formatTemplateFileSize,
  getTemplateFileUrl,
  templateVersionPeriodLabel,
  type DocumentTemplateVersion,
} from "@/lib/document-templates"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { showError } from "@/utils/toast"
import { Download, FileText, RefreshCw, Upload } from "lucide-react"

/**
 * Fase 11B.1 — Archivos de una versión (§35/§36/§84).
 *
 * El DOCX original es la plantilla base y es obligatorio para activar.
 * La versión configurada es opcional: si existe, es el archivo vigente de la
 * versión (el que se analiza y, en 11B.2, el que se usará para generar).
 */

interface Props {
  version: DocumentTemplateVersion
  canManage: boolean
  busy: boolean
  onUpload: (file: File, kind: "ORIGINAL" | "CONFIGURED") => Promise<void>
  onReanalyze: () => Promise<void>
}

const DocumentTemplateFilesPanel = ({ version, canManage, busy, onUpload, onReanalyze }: Props) => {
  const [downloading, setDownloading] = React.useState(false)

  const isDraft = version.status === "DRAFT"
  const effectivePath = version.configured_file_path || version.original_file_path

  const handleDownload = async (path: string | null) => {
    if (!path) return
    setDownloading(true)
    try {
      const url = await getTemplateFileUrl(path)
      if (!url) {
        showError("No se pudo generar el enlace de descarga.")
        return
      }
      window.open(url, "_blank", "noopener,noreferrer")
    } finally {
      setDownloading(false)
    }
  }

  const fileRow = (
    kind: "ORIGINAL" | "CONFIGURED",
    title: string,
    path: string | null,
    name: string | null,
    size: number | null,
    uploadedAt: string | null,
    hint: string
  ) => (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-sitecorp-primary" />
            <p className="text-sm font-semibold text-ink">{title}</p>
          </div>
          {path ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {name || "archivo.docx"} · {formatTemplateFileSize(size)} · cargado el{" "}
              {formatDocumentDate(uploadedAt) || "—"}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Sin archivo cargado.</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {path && (
            <SiteCorpButton
              size="sm"
              variant="outline"
              disabled={downloading || busy}
              onClick={() => handleDownload(path)}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Descargar
            </SiteCorpButton>
          )}
          {canManage && isDraft && (
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sitecorp-primary/40 px-3 py-1.5 text-sm font-medium text-sitecorp-primary hover:bg-sitecorp-primary/5">
              <Upload className="h-3.5 w-3.5" />
              {path ? "Reemplazar" : "Subir"}
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) void onUpload(file, kind)
                }}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <SiteCorpCard
      title={`Archivos de la versión ${version.version_number}`}
      description={templateVersionPeriodLabel(version)}
    >
      <div className="space-y-4">
        {fileRow(
          "ORIGINAL",
          "Documento original (DOCX)",
          version.original_file_path,
          version.original_file_name,
          version.original_file_size,
          version.original_uploaded_at,
          "Modelo oficial de la entidad, conservado intacto: nunca se modifica ni se sobrescribe."
        )}

        {fileRow(
          "CONFIGURED",
          "Documento configurado (DOCX)",
          version.configured_file_path,
          version.configured_file_name,
          version.configured_file_size,
          version.configured_uploaded_at,
          effectivePath === version.configured_file_path && version.configured_file_path
            ? "Es el documento analizado: define las variables requeridas de esta versión."
            : "Cópielo del original y sustituya los datos que cambian por las variables del catálogo. Es obligatorio para activar."
        )}

        {!isDraft && (
          <SiteCorpAlert type="info">
            Esta versión está {version.status === "ACTIVE" ? "activa" : "inactiva"} y sus archivos
            son inmutables: para cambiar el contenido cree una nueva versión.
          </SiteCorpAlert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Cada archivo cargado se conserva por separado y cualquier cambio invalida el análisis
            anterior: vuelva a analizarlo.
          </p>
          <SiteCorpButton
            size="sm"
            variant="outline"
            disabled={busy || !effectivePath}
            onClick={onReanalyze}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Analizar de nuevo
          </SiteCorpButton>
        </div>
      </div>
    </SiteCorpCard>
  )
}

export default DocumentTemplateFilesPanel
