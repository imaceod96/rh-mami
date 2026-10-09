/**
 * Shim de compatibilidad.
 *
 * La implementación del Anexo14B (plantilla con trabajadores) se migró al
 * contexto DDD `organization-structure`. Este módulo solo reexporta
 * explícitamente su superficie pública original —incluido el alias de
 * compatibilidad `buildAnexo14FileName`— para no romper consumidores.
 * Dirección de dependencias: shim → dominio.
 */

export type { StaffingExportRow } from "@/domains/organization-structure"
export type { StaffingExportMeta } from "@/domains/organization-structure"

export {
  ANEXO14_HEADERS,
  fetchStaffingExportRows,
  buildStaffingWorkbookBlob,
  saveStaffingExcelBlob,
  formatService,
  buildAnexo14BFileName,
} from "@/domains/organization-structure"

/**
 * Alias de compatibilidad con la superficie pública original.
 * Solo existe en este shim; NO se exporta desde el barrel del dominio para
 * evitar colisión con `buildAnexo14FileName` del Anexo 14 de puestos.
 */
export { buildAnexo14BFileName as buildAnexo14FileName } from "@/domains/organization-structure"
