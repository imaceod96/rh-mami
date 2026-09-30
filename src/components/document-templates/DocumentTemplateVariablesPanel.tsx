import * as React from "react"
import { DOCUMENT_VARIABLES, type DocumentVariableDefinition } from "@/lib/document-variables"
import { documentTypeCodeForTemplateType } from "@/lib/document-templates"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { showSuccess, showError } from "@/utils/toast"
import { Copy, Search, Braces } from "lucide-react"

/**
 * Fase 11B.1 — Panel de variables documentales disponibles (§74/§75/§76).
 *
 * Lee el registro central de 11A.7 (`DOCUMENT_VARIABLES`): no existe una lista
 * paralela escrita a mano. Sólo muestra las variables que aplican al tipo de
 * documento de la plantilla y señala las obligatorias.
 */

interface Props {
  templateTypeCode: string
  requiredKeys: string[]
}

const dataTypeLabel: Record<DocumentVariableDefinition["dataType"], string> = {
  text: "Texto",
  integer: "Número",
  amount: "Importe",
  date: "Fecha",
  hours: "Horas",
}

export const templatePlaceholder = (key: string): string => `{{${key}}}`

const DocumentTemplateVariablesPanel = ({ templateTypeCode, requiredKeys }: Props) => {
  const [search, setSearch] = React.useState("")
  const [onlyRequired, setOnlyRequired] = React.useState(false)

  const documentType = documentTypeCodeForTemplateType(templateTypeCode)
  const requiredSet = React.useMemo(() => new Set(requiredKeys), [requiredKeys])

  const applicable = React.useMemo(
    () => DOCUMENT_VARIABLES.filter((definition) => definition.documentTypes.includes(documentType)),
    [documentType]
  )

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return applicable.filter((definition) => {
      if (onlyRequired && !requiredSet.has(definition.key)) return false
      if (!term) return true
      return (
        definition.key.toLowerCase().includes(term) ||
        definition.label.toLowerCase().includes(term) ||
        definition.category.toLowerCase().includes(term)
      )
    })
  }, [applicable, onlyRequired, requiredSet, search])

  const byCategory = React.useMemo(() => {
    const map = new Map<string, DocumentVariableDefinition[]>()
    filtered.forEach((definition) => {
      const list = map.get(definition.category) || []
      list.push(definition)
      map.set(definition.category, list)
    })
    return Array.from(map.entries())
  }, [filtered])

  const handleCopy = async (key: string) => {
    const placeholder = templatePlaceholder(key)
    try {
      await navigator.clipboard.writeText(placeholder)
      showSuccess(`Marcador copiado: ${placeholder}`)
    } catch {
      showError("No se pudo copiar el marcador al portapapeles.")
    }
  }

  return (
    <SiteCorpCard
      title="Variables documentales disponibles"
      description={`Marcadores que esta plantilla puede usar (${applicable.length} disponibles para este tipo de documento).`}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <SiteCorpInput
              className="pl-9"
              value={search}
              placeholder="Buscar por nombre, marcador o categoría…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input text-sitecorp-primary focus:ring-sitecorp-primary"
              checked={onlyRequired}
              onChange={(event) => setOnlyRequired(event.target.checked)}
            />
            Ver solo obligatorias ({requiredKeys.length})
          </label>
        </div>

        <p className="rounded-xl border border-sitecorp-primary/20 bg-sitecorp-primary/5 p-3 text-xs text-muted-foreground">
          Cada marcador se escribe en el DOCX entre dobles llaves. Word puede dividir el texto en
          varios fragmentos internos: el analizador central los une antes de verificar la plantilla.
        </p>

        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay variables que coincidan con la búsqueda.</p>
        ) : (
          <div className="space-y-5">
            {byCategory.map(([category, definitions]) => (
              <div key={category} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </p>
                <div className="space-y-2">
                  {definitions.map((definition) => {
                    const isRequired = requiredSet.has(definition.key)
                    return (
                      <div
                        key={definition.key}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Braces className="h-3.5 w-3.5 text-sitecorp-primary" />
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-ink">
                              {templatePlaceholder(definition.key)}
                            </code>
                            <span className="text-sm font-medium text-ink">{definition.label}</span>
                            {isRequired && <SiteCorpStatusBadge status="warning">Obligatoria</SiteCorpStatusBadge>}
                            {definition.kind === "CALCULATED" && (
                              <SiteCorpStatusBadge status="info">Calculada</SiteCorpStatusBadge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {definition.description} · {dataTypeLabel[definition.dataType]}
                          </p>
                        </div>
                        <SiteCorpButton
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(definition.key)}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          Copiar
                        </SiteCorpButton>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SiteCorpCard>
  )
}

export default DocumentTemplateVariablesPanel
