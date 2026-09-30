import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import {
  fetchDocumentTemplateTypes,
  fetchDocumentTemplates,
  templateVersionPeriodLabel,
  type DocumentTemplate,
  type DocumentTemplateType,
} from "@/lib/document-templates"
import CreateDocumentTemplateDialog from "@/components/document-templates/CreateDocumentTemplateDialog"
import { FileText, Plus, ArrowRight, FileCheck2, FileClock } from "lucide-react"

/**
 * Fase 11B.1 — Listado de plantillas documentales de la entidad (§17/§34).
 */

const EntitySettingsDocumentTemplates = () => {
  const { entityId: routeEntityId } = useParams<{ entityId: string }>()
  const { currentEntity } = useCurrentEntity()
  const entityId = routeEntityId || currentEntity?.id || ""
  const navigate = useNavigate()

  const [loading, setLoading] = React.useState(true)
  const [notAllowed, setNotAllowed] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [entityName, setEntityName] = React.useState("")
  const [types, setTypes] = React.useState<DocumentTemplateType[]>([])
  const [templates, setTemplates] = React.useState<DocumentTemplate[]>([])
  const [showCreate, setShowCreate] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    if (!entityId) {
      setNotAllowed("No se pudo determinar la entidad.")
      setLoading(false)
      return
    }

    setLoading(true)
    setNotAllowed(null)
    setLoadError(null)

    try {
      const [{ data: canView }, { data: canManageOrganization }, { data: entity }] =
        await Promise.all([
          supabase.rpc("can_access_entity", {
            target_entity_id: entityId,
            permission_code: "organization.view",
          }),
          supabase.rpc("can_access_entity", {
            target_entity_id: entityId,
            permission_code: "organization.manage",
          }),
          supabase
            .from("organization_entities")
            .select("name")
            .eq("id", entityId)
            .maybeSingle(),
        ])

      if (!canView && !canManageOrganization) {
        setNotAllowed("No tiene permiso para consultar las plantillas documentales de esta entidad.")
        return
      }

      setCanManage(!!canManageOrganization)
      setEntityName((entity as { name: string } | null)?.name || "")

      const [catalog, loadedTemplates] = await Promise.all([
        fetchDocumentTemplateTypes(),
        fetchDocumentTemplates(entityId),
      ])
      setTypes(catalog)
      setTemplates(loadedTemplates)
    } catch (err) {
      console.error("Error loading document templates:", err)
      setLoadError(
        err instanceof Error ? err.message : "No se pudieron cargar las plantillas documentales."
      )
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const header = (
    <SiteCorpPageHeader
      title="Plantillas documentales"
      description={`Estructuras DOCX de los documentos contractuales de ${
        entityName || "la entidad"
      }`}
    />
  )

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        {header}
        <SiteCorpLoading rows={5} />
      </div>
    )
  }

  if (notAllowed) {
    return (
      <div className="space-y-6 p-6">
        {header}
        <SiteCorpAlert type="danger">{notAllowed}</SiteCorpAlert>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {header}

      <SiteCorpAlert type="info" title="Cómo funcionan las plantillas">
        Cada plantilla es un archivo DOCX con marcadores (por ejemplo{" "}
        <code className="font-mono">{"{{worker.full_name}}"}</code>) que SiteCorp rellenará en 11B.2.
        Aquí solo se gestiona la plantilla: su contenido no se modifica ni se generan documentos.
      </SiteCorpAlert>

      {loadError && <SiteCorpAlert type="danger">{loadError}</SiteCorpAlert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} plantilla(s) configurada(s) · máximo una versión activa por tipo de
          documento.
        </p>
        {canManage && (
          <SiteCorpButton onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva plantilla
          </SiteCorpButton>
        )}
      </div>

      {types.map((type) => {
        const group = templates.filter((template) => template.document_type_code === type.code)
        return (
          <SiteCorpCard key={type.code} title={type.name} description={type.description || undefined}>
            {group.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Todavía no hay plantillas de este tipo para la entidad.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {group.map((template) => {
                  const active = template.versions.find((version) => version.status === "ACTIVE")
                  const drafts = template.versions.filter((version) => version.status === "DRAFT").length
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          `/entity/${entityId}/settings/document-templates/${template.id}`
                        )
                      }
                      className="flex w-full flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-all hover:border-sitecorp-primary/30 hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{template.name}</p>
                          {active ? (
                            <SiteCorpStatusBadge status="success">
                              Activa · v{active.version_number}
                            </SiteCorpStatusBadge>
                          ) : (
                            <SiteCorpStatusBadge status="warning">Sin versión activa</SiteCorpStatusBadge>
                          )}
                          {drafts > 0 && (
                            <SiteCorpStatusBadge status="info">
                              {drafts} borrador(es)
                            </SiteCorpStatusBadge>
                          )}
                        </div>
                        {template.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                        )}
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {active ? (
                            <>
                              <FileCheck2 className="h-3.5 w-3.5" />
                              {templateVersionPeriodLabel(active)}
                            </>
                          ) : (
                            <>
                              <FileClock className="h-3.5 w-3.5" />
                              {template.versions.length} versión(es) registrada(s)
                            </>
                          )}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-sitecorp-primary">
                        Abrir
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </SiteCorpCard>
        )
      })}

      <CreateDocumentTemplateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        entityId={entityId}
        onCreated={async (templateId) => {
          navigate(`/entity/${entityId}/settings/document-templates/${templateId}`)
        }}
      />
    </div>
  )
}

export default EntitySettingsDocumentTemplates
