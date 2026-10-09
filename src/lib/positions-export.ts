/**
 * Shim de compatibilidad.
 *
 * La implementación del Anexo 14 (puestos) se migró al contexto DDD
 * `organization-structure`. Este módulo solo reexporta explícitamente su
 * superficie pública para no romper los consumidores existentes.
 * Dirección de dependencias: shim → dominio.
 */

export type { Anexo14Row } from "@/domains/organization-structure"
export type { Anexo14Filters } from "@/domains/organization-structure"
export type { Anexo14Meta } from "@/domains/organization-structure"

export {
  ANEXO_14_HEADERS,
  NO_CATEGORY_VALUE,
  NOT_CONFIGURED_VALUE,
  buildAnexo14FileName,
  fetchAnexo14Rows,
  buildAnexo14WorkbookBlob,
  saveAnexo14Blob,
} from "@/domains/organization-structure"
