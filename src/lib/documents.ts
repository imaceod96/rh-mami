// Utilidades compartidas para el expediente documental (Worker / Candidate).
// Fuente única de verdad para validación de archivos y formato de tamaños.

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

// Compatible con los formatos ya soportados por el sistema documental de candidatos.
export const ALLOWED_DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "gif",
] as const

export const DOCUMENT_ACCEPT_ATTR = ALLOWED_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",")

export function getFileExtension(name: string): string {
  const parts = name.split(".")
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ""
}

export function formatFileSize(size: number | null | undefined): string {
  if (!size) return "—"
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** Devuelve un mensaje de error si el archivo no es válido, o null si lo es. */
export function validateDocumentFile(file: File): string | null {
  const ext = getFileExtension(file.name)
  if (!ext || !(ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Formato no permitido. Formatos válidos: ${ALLOWED_DOCUMENT_EXTENSIONS.join(", ").toUpperCase()}.`
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return `El archivo supera el tamaño máximo permitido (${formatFileSize(MAX_DOCUMENT_SIZE_BYTES)}).`
  }
  return null
}

/** Nombre seguro para usar en la ruta de Storage (sin espacios ni caracteres problemáticos). */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
  return cleaned.replace(/^_+|_+$/g, "") || "documento"
}

/** Indica si el documento puede previsualizarse en el navegador (PDF o imagen). */
export function isViewableDocument(mimeType: string | null, fileName: string): boolean {
  if (mimeType && (mimeType === "application/pdf" || mimeType.startsWith("image/"))) return true
  return ["pdf", "jpg", "jpeg", "png", "gif"].includes(getFileExtension(fileName))
}

export function formatDocumentDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("es-CU")
}
