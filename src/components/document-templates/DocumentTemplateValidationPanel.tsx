import * as React from "react"
import type { TemplateValidation } from "@/lib/document-templates"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react"

/**
 * Fase 11B.1 — Checklist de validación de una versión (§51/§52/§85–§88).
 *
 * Todas las marcas provienen del backend (`validate_document_template_version`):
 * la interfaz no decide por sí sola si una plantilla es válida.
 */

interface Props {
  validation: TemplateValidation | null
  loading?: boolean
}

interface CheckDescriptor {
  key: keyof TemplateValidation["checks"]
  label: string
  blocking: boolean
}

const CHECKS: CheckDescriptor[] = [
  { key: "original_file_present", label: "Archivo DOCX original cargado", blocking: true },
  { key: "valid_docx", label: "El archivo es un DOCX válido (paquete Word)", blocking: true },
  { key: "analysis_present", label: "Análisis de contenido registrado", blocking: true },
  { key: "analysis_current", label: "El análisis corresponde al archivo vigente", blocking: true },
  { key: "no_unknown_variables", label: "No usa variables documentales desconocidas", blocking: true },
  { key: "no_malformed_placeholders", label: "No contiene marcadores malformados", blocking: true },
  { key: "required_variables_present", label: "Incluye todas las variables obligatorias del tipo", blocking: true },
  { key: "has_placeholders", label: "La plantilla usa variables documentales", blocking: false },
  { key: "configured_file_present", label: "Versión configurada cargada (opcional)", blocking: false },
]

const DocumentTemplateValidationPanel = ({ validation, loading }: Props) => {
  if (loading) {
    return (
      <SiteCorpCard title="Validación de la versión">
        <SiteCorpLoading rows={4} />
      </SiteCorpCard>
    )
  }

  if (!validation) {
    return (
      <SiteCorpCard title="Validación de la versión">
        <p className="text-sm text-muted-foreground">
          Seleccione una versión para ver su validación.
        </p>
      </SiteCorpCard>
    )
  }

  const analysis = validation.analysis

  return (
    <div className="space-y-4">
      <SiteCorpCard
        title="Validación de la versión"
        description={`Versión ${validation.version_number} · archivo evaluado: ${
          validation.source_file_kind === "CONFIGURED" ? "versión configurada" : "DOCX original"
        }`}
      >
        <div className="space-y-4">
          <div
            className={
              validation.ready
                ? "flex items-center gap-3 rounded-xl border border-sitecorp-success/30 bg-sitecorp-success/10 p-3"
                : "flex items-center gap-3 rounded-xl border border-sitecorp-warning/30 bg-sitecorp-warning/10 p-3"
            }
          >
            {validation.ready ? (
              <CheckCircle2 className="h-5 w-5 text-sitecorp-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-sitecorp-warning" />
            )}
            <div>
              <p className="text-sm font-semibold text-ink">
                {validation.ready
                  ? "La versión puede activarse"
                  : "La versión todavía no puede activarse"}
              </p>
              <p className="text-xs text-muted-foreground">
                {validation.ready
                  ? "Todos los controles obligatorios se cumplen. Al activarla sustituirá a la versión vigente del mismo tipo."
                  : "Resuelva los controles pendientes antes de activarla."}
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {CHECKS.map((check) => {
              const passed = validation.checks[check.key]
              return (
                <li key={check.key} className="flex items-start gap-3 text-sm">
                  {passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sitecorp-success" />
                  ) : check.blocking ? (
                    <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-sitecorp-danger" />
                  ) : (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={passed ? "text-muted-foreground" : "text-ink"}>
                    {check.label}
                    {!passed && !check.blocking && " (informativo)"}
                  </span>
                </li>
              )
            })}
          </ul>

          {validation.missing_required.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Variables obligatorias ausentes ({validation.missing_required.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {validation.missing_required.map((variable) => (
                  <code
                    key={variable.key}
                    className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-sitecorp-danger"
                    title={variable.label}
                  >
                    {`{{${variable.key}}}`}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      </SiteCorpCard>

      <SiteCorpCard
        title="Análisis de contenido"
        description="Resultado del analizador central sobre el archivo vigente de la versión."
      >
        {!analysis ? (
          <p className="text-sm text-muted-foreground">
            Esta versión todavía no tiene un análisis registrado.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Marcadores reconocidos</p>
                <p className="text-lg font-semibold text-ink">{analysis.recognized.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Párrafos analizados</p>
                <p className="text-lg font-semibold text-ink">{analysis.paragraphs_scanned}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Marcadores divididos por Word</p>
                <p className="text-lg font-semibold text-ink">{analysis.split_run_placeholders}</p>
              </div>
            </div>

            {analysis.warnings.length > 0 && (
              <SiteCorpAlert type="warning" title="Advertencias del análisis">
                <ul className="list-inside list-disc space-y-1">
                  {analysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </SiteCorpAlert>
            )}

            {analysis.recognized.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Variables usadas
                </p>
                <div className="flex flex-wrap gap-2">
                  {analysis.recognized.map((occurrence) => (
                    <span
                      key={occurrence.key}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-2 py-1"
                    >
                      <code className="font-mono text-xs text-ink">{`{{${occurrence.key}}}`}</code>
                      <SiteCorpStatusBadge status="neutral">×{occurrence.count}</SiteCorpStatusBadge>
                      {occurrence.split_runs > 0 && (
                        <SiteCorpStatusBadge status="info">dividido</SiteCorpStatusBadge>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.unknown_variables.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-sitecorp-danger">
                  Variables desconocidas
                </p>
                <div className="flex flex-wrap gap-2">
                  {analysis.unknown_variables.map((variable) => (
                    <code
                      key={variable.key}
                      className="rounded bg-sitecorp-danger/10 px-1.5 py-0.5 font-mono text-xs text-sitecorp-danger"
                    >
                      {`{{${variable.key}}}`}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Estas variables no existen en el registro documental o no aplican a este tipo de
                  documento.
                </p>
              </div>
            )}

            {analysis.malformed_placeholders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-sitecorp-danger">
                  Marcadores malformados
                </p>
                <ul className="space-y-1">
                  {analysis.malformed_placeholders.map((malformed, index) => (
                    <li key={`${malformed.part}-${index}`} className="text-xs text-muted-foreground">
                      <code className="font-mono text-sitecorp-danger">{malformed.snippet}</code>{" "}
                      <span className="text-muted-foreground">({malformed.part})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Partes analizadas: {analysis.scanned_parts.join(", ") || "—"}
            </p>
          </div>
        )}
      </SiteCorpCard>
    </div>
  )
}

export default DocumentTemplateValidationPanel
