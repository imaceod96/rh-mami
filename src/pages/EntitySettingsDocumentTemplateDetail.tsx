import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { showSuccess, showError } from "@/utils/toast"
import {
  activateTemplateVersion,
  analyzeAndStoreTemplateFile,
  createDocumentTemplateVersion,
  deactivateTemplateVersion,
  deleteDocumentTemplate,
  describeTemplateFileProblem,
  fetchDocumentTemplate,
  fetchDocumentTemplateTypes,
  fetchRequiredVariableKeys,
  uploadTemplateFile,
  validateTemplateVersion,
  type DocumentTemplate,
  type DocumentTemplateVersion,
  type TemplateValidation,
} from "@/lib/document-templates"
import DocumentTemplateFilesPanel from "@/components/document-templates/DocumentTemplateFilesPanel"
import DocumentTemplateValidationPanel from "@/components/document-templates/DocumentTemplateValidationPanel"
import DocumentTemplateVersionsPanel from "@/components/document-templates/DocumentTemplateVersionsPanel"
import DocumentTemplateVariablesPanel from "@/components/document-templates/DocumentTemplateVariablesPanel"
import { ArrowLeft, FileWarning, Trash2 } from "lucide-react"

/**
 * Fase 11B.1 — Detalle de una plantilla documental: archivos, análisis,
 * validación, versionado y variables disponibles (§37–§44/§51/§75/§77).
 */

const EntitySettingsDocumentTemplateDetail = () => {
  const { entityId: routeEntityId, templateId } = useParams<{
    entityId: string
    templateId: string
  }>()
  const { currentEntity } = useCurrentEntity()
  const entityId = routeEntityId || currentEntity?.id || ""
  const navigate = useNavigate()

  const [loading, setLoading] = React.useState(true)
  const [notAllowed, setNotAllowed] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [template, setTemplate] = React.useState<DocumentTemplate | null>(null)
  const [typeName, setTypeName] = React.useState("")
  const [requiredKeys, setRequiredKeys] = React.useState<string[]>([])
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const [validation, setValidation] = React.useState<TemplateValidation | null>(null)
  const [validationLoading, setValidationLoading] = React.useState(false)
  const [busyLabel, setBusyLabel] = React.useState<string | null>(null)
  const [showDelete, setShowDelete] = React.useState(false)

  const busy = busyLabel !== null

  const selectedVersion: DocumentTemplateVersion | null =
    template?.versions.find((version) => version.id === selectedVersionId) ??
    template?.versions[0] ??
    null

  const loadValidation = React.useCallback(async (versionId: string | null) => {
    if (!versionId) {
      setValidation(null)
      return
    }
    setValidationLoading(true)
    try {
      const result = await validateTemplateVersion(versionId)
      setValidation(result)
    } catch (err) {
      console.error("Error validating template version:", err)
      setValidation(null)
    } finally {
      setValidationLoading(false)
    }
  }, [])

  const reload = React.useCallback(
    async (preferredVersionId?: string | null) => {
      if (!templateId) return
      const fresh = await fetchDocumentTemplate(templateId)
      setTemplate(fresh)

      const versions = fresh?.versions ?? []
      const nextId =
        (preferredVersionId && versions.some((version) => version.id === preferredVersionId)
          ? preferredVersionId
          : null) ??
        versions.find((version) => version.status === "ACTIVE")?.id ??
        versions[0]?.id ??
        null

      setSelectedVersionId(nextId)
      await loadValidation(nextId)
    },
    [loadValidation, templateId]
  )

  const initialLoad = React.useCallback(async () => {
    if (!entityId || !templateId) {
      setNotAllowed("No se pudo determinar la entidad o la plantilla.")
      setLoading(false)
      return
    }

    setLoading(true)
    setNotAllowed(null)

    try {
      const [{ data: canView }, { data: canManageOrganization }] = await Promise.all([
        supabase.rpc("can_access_entity", {
          target_entity_id: entityId,
          permission_code: "organization.view",
        }),
        supabase.rpc("can_access_entity", {
          target_entity_id: entityId,
          permission_code: "organization.manage",
        }),
      ])

      if (!canView && !canManageOrganization) {
        setNotAllowed("No tiene permiso para consultar esta plantilla documental.")
        return
      }

      setCanManage(!!canManageOrganization)

      const fresh = await fetchDocumentTemplate(templateId)
      if (!fresh || fresh.organization_entity_id !== entityId) {
        setNotAllowed("La plantilla no existe o no pertenece a esta entidad.")
        return
      }

      setTemplate(fresh)

      const versions = fresh.versions
      const nextId =
        versions.find((version) => version.status === "ACTIVE")?.id ?? versions[0]?.id ?? null
      setSelectedVersionId(nextId)

      const [types, required] = await Promise.all([
        fetchDocumentTemplateTypes(),
        fetchRequiredVariableKeys(fresh.document_type_code),
      ])
      setTypeName(
        types.find((type) => type.code === fresh.document_type_code)?.name ||
          fresh.document_type_code
      )
      setRequiredKeys(required)

      await loadValidation(nextId)
    } catch (err) {
      console.error("Error loading document template:", err)
      setNotAllowed(
        err instanceof Error ? err.message : "No se pudo cargar la plantilla documental."
      )
    } finally {
      setLoading(false)
    }
  }, [entityId, loadValidation, templateId])

  React.useEffect(() => {
    initialLoad()
  }, [initialLoad])

  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(versionId)
    loadValidation(versionId)
  }

  const handleUpload = async (file: File, kind: "ORIGINAL" | "CONFIGURED") => {
    if (!selectedVersion || !template || !templateId) return

    const problem = await describeTemplateFileProblem(file)
    if (problem) {
      showError(problem)
      return
    }

    try {
      setBusyLabel("Subiendo el archivo…")
      const path = await uploadTemplateFile({
        entityId,
        templateId,
        version: selectedVersion,
        kind,
        file,
      })

      setBusyLabel("Analizando el contenido del DOCX…")
      const analysis = await analyzeAndStoreTemplateFile(selectedVersion.id, path)

      if (analysis.valid_docx) {
        showSuccess("Archivo cargado y analizado correctamente.")
      } else {
        showError("El archivo se cargó, pero no es un DOCX válido.")
      }

      setBusyLabel(null)
      await reload(selectedVersion.id)
    } catch (err) {
      setBusyLabel(null)
      showError(err instanceof Error ? err.message : "No se pudo procesar el archivo.")
    }
  }

  const handleReanalyze = async () => {
    if (!selectedVersion) return
    const path = selectedVersion.configured_file_path || selectedVersion.original_file_path
    if (!path) {
      showError("La versión no tiene ningún archivo para analizar.")
      return
    }
    try {
      setBusyLabel("Analizando el contenido del DOCX…")
      await analyzeAndStoreTemplateFile(selectedVersion.id, path)
      showSuccess("Análisis actualizado.")
      setBusyLabel(null)
      await reload(selectedVersion.id)
    } catch (err) {
      setBusyLabel(null)
      showError(err instanceof Error ? err.message : "No se pudo analizar el archivo.")
    }
  }

  const handleActivate = async (version: DocumentTemplateVersion) => {
    try {
      setBusyLabel(`Activando la versión ${version.version_number}…`)
      const result = await activateTemplateVersion(version.id)
      const closed = result.deactivated_previous?.length
        ? ` Se cerró la versión anterior (${result.deactivated_previous
            .map((item) => `v${item.version_number}`)
            .join(", ")}).`
        : ""
      showSuccess(`Versión ${version.version_number} activada.${closed}`)
      setBusyLabel(null)
      await reload(version.id)
    } catch (err) {
      setBusyLabel(null)
      showError(err instanceof Error ? err.message : "No se pudo activar la versión.")
    }
  }

  const handleDeactivate = async (version: DocumentTemplateVersion) => {
    try {
      setBusyLabel("Desactivando la versión…")
      await deactivateTemplateVersion(version.id)
      showSuccess("La versión quedó inactiva. La entidad no tiene plantilla vigente de este tipo.")
      setBusyLabel(null)
      await reload(version.id)
    } catch (err) {
      setBusyLabel(null)
      showError(err instanceof Error ? err.message : "No se pudo desactivar la versión.")
    }
  }

  const handleCreateVersion = async (effectiveFrom: string | null) => {
    if (!templateId) return
    try {
      setBusyLabel("Creando la nueva versión…")
      const created = await createDocumentTemplateVersion(templateId, effectiveFrom)
      showSuccess(`Versión ${created.version_number} creada como borrador.`)
      setBusyLabel(null)
      await reload(created.version_id)
    } catch (err) {
      setBusyLabel(null)
      showError(err instanceof Error ? err.message : "No se pudo crear la versión.")
    }
  }

  const handleDelete = async () => {
    if (!template || !templateId) return
    try {
      setBusyLabel("Eliminando la plantilla…")
      await deleteDocumentTemplate(templateId, template.versions)
      showSuccess("Plantilla eliminada.")
      setBusyLabel(null)
      setShowDelete(false)
      navigate(`/entity/${entityId}/settings/document-templates`)
    } catch (err) {
      setBusyLabel(null)
      showError(err instanceof Error ? err.message : "No se pudo eliminar la plantilla.")
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Plantilla documental" description="Cargando plantilla…" />
        <SiteCorpLoading rows={6} />
      </div>
    )
  }

  if (notAllowed || !template) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Plantilla documental" description="Detalle de la plantilla" />
        <SiteCorpAlert type="danger">
          {notAllowed || "No se pudo cargar la plantilla documental."}
        </SiteCorpAlert>
        <SiteCorpButton
          variant="outline"
          onClick={() => navigate(`/entity/${entityId}/settings/document-templates`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al listado
        </SiteCorpButton>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title={template.name}
        description={typeName || template.document_type_code}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SiteCorpButton
          variant="outline"
          size="sm"
          onClick={() => navigate(`/entity/${entityId}/settings/document-templates`)}
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Volver al listado
        </SiteCorpButton>

        <div className="flex flex-wrap items-center gap-2">
          <SiteCorpStatusBadge status="neutral">
            {template.versions.length} versión(es)
          </SiteCorpStatusBadge>
          {canManage && (
            <SiteCorpButton variant="outline" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Eliminar plantilla
            </SiteCorpButton>
          )}
        </div>
      </div>

      {busyLabel && <SiteCorpAlert type="info">{busyLabel}</SiteCorpAlert>}

      {!canManage && (
        <SiteCorpAlert type="info">
          Sólo los usuarios autorizados para configurar la organización pueden modificar las
          plantillas de esta entidad.
        </SiteCorpAlert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {selectedVersion ? (
            <DocumentTemplateFilesPanel
              version={selectedVersion}
              canManage={canManage}
              busy={busy}
              onUpload={handleUpload}
              onReanalyze={handleReanalyze}
            />
          ) : (
            <SiteCorpAlert type="warning" title="Sin versiones">
              Esta plantilla no tiene versiones registradas. Cree una nueva versión para continuar.
            </SiteCorpAlert>
          )}

          <DocumentTemplateValidationPanel validation={validation} loading={validationLoading} />
        </div>

        <div className="space-y-4">
          <DocumentTemplateVersionsPanel
            versions={template.versions}
            selectedVersionId={selectedVersionId}
            canManage={canManage}
            busy={busy}
            onSelect={handleSelectVersion}
            onActivate={handleActivate}
            onDeactivate={handleDeactivate}
            onCreateVersion={handleCreateVersion}
          />
        </div>
      </div>

      <DocumentTemplateVariablesPanel
        templateTypeCode={template.document_type_code}
        requiredKeys={requiredKeys}
      />

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-sitecorp-danger" />
              Eliminar plantilla
            </DialogTitle>
            <DialogDescription>
              Se eliminará «{template.name}» con sus {template.versions.length} versión(es) y sus
              archivos DOCX. Esta acción no puede deshacerse.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <SiteCorpAlert type="warning">
              Los contratos y anexos ya formalizados no se modifican: sólo se pierde la plantilla de
              configuración.
            </SiteCorpAlert>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <SiteCorpButton variant="outline" onClick={() => setShowDelete(false)} disabled={busy}>
                Cancelar
              </SiteCorpButton>
              <SiteCorpButton onClick={handleDelete} disabled={busy}>
                {busy ? "Eliminando…" : "Eliminar definitivamente"}
              </SiteCorpButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EntitySettingsDocumentTemplateDetail
