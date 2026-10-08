import { supabase } from "@/lib/supabase"
import { ciToBirthDate } from "@/utils/ci"
import type { Workbook, Cell, Row } from "exceljs"

/** Tipado mínimo del módulo ExcelJS usado por esta exportación (solo `Workbook`). */
type ExcelJSModule = {
  Workbook: typeof Workbook
  default?: { Workbook: typeof Workbook }
}

// Plantilla simplificada de Carga inicial. No incluye "Fecha nacimiento"
// (se deriva de la identificación) ni "Código Puesto" (la carga inicial no
// asigna puestos; la vinculación se hace después desde Trabajadores).
export const MIGRATION_HEADERS = [
  "Identificación", "Nombre", "Primer apellido", "Segundo apellido",
  "Sexo", "Color de piel", "Estado civil", "Dirección",
  "Fecha de incorporación", "Saldo inicial vacaciones", "Fecha corte vacaciones",
  "Teléfono", "Correo", "Provincia", "Municipio",
  "Nivel educacional", "Especialidad", "Profesión u oficio",
  "Tiene licencia", "Categorías licencia",
] as const

export interface MigrationRow {
  identification: string
  first_name: string
  first_surname: string
  second_surname: string
  birth_date: string
  gender_id: string
  marital_status_id: string
  skin_color_id: string
  phone: string
  email: string
  address: string
  province: string
  municipality: string
  employment_start_date: string
  education_level_id: string
  specialty: string
  profession_or_trade: string
  driving_license_category_ids: string[]
  position_code: string
  position_id?: string
  initial_vacation_balance: string
  vacation_cutoff_date: string
}

export interface MigrationPreviewRow {
  index: number
  status: "VALID" | "WARNING" | "ERROR"
  messages: string[]
  position_id: string | null
  position_label: string | null
}

const catalogMaps = (options: { id: string; name: string; code?: string | null }[]) => {
  const byName = new Map<string, string>()
  options.forEach((option) => {
    byName.set(option.name.trim().toLocaleLowerCase(), option.id)
    if (option.code) byName.set(option.code.trim().toLocaleLowerCase(), option.id)
  })
  return byName
}

const mapCatalogValue = (value: string, map: Map<string, string>) =>
  map.get(value.trim().toLocaleLowerCase()) || value

const excelDate = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return date.toISOString().slice(0, 10)
  }
  const text = String(value ?? "").trim()
  if (!text) return ""
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return text
}

const excelText = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "object") {
    if ("text" in value) return String((value as { text: unknown }).text ?? "").trim()
    if ("result" in value) return excelText((value as { result: unknown }).result)
    return ""
  }
  return String(value).trim()
}

const decimalText = (value: unknown): string => {
  const text = excelText(value).replace(/\s/g, "")
  if (!text) return ""
  if (text.includes(",") && text.includes(".")) {
    return text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "")
  }
  return text.replace(",", ".")
}

export async function buildWorkerMigrationTemplate(): Promise<Blob> {
  const mod: ExcelJSModule = await import("exceljs")
  const ExcelJS = mod?.default ?? mod
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "SiteCorp"
  const sheet = workbook.addWorksheet("Trabajadores", { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = MIGRATION_HEADERS.map((header, index) => ({ header, key: `c${index}`, width: index < 4 ? 22 : 20 }))
  sheet.getColumn(1).numFmt = "@"
  sheet.getColumn(9).numFmt = "@"
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174A67" } }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: MIGRATION_HEADERS.length } }
  const instructions = workbook.addWorksheet("Instrucciones")
  instructions.columns = [{ width: 34 }, { width: 110 }]
  instructions.addRows([
    ["Campo", "Instrucciones"],
    ["Identificación", "Obligatoria. Se conserva como texto; no elimine ceros ni cambie su formato."],
    ["Fecha de nacimiento", "No se solicita: SiteCorp la deriva automáticamente de la identificación cuando es posible. Si no puede derivarse, el trabajador queda con información pendiente de completar."],
    ["Fecha de incorporación", "Obligatoria. Indique la fecha real en la que el trabajador comenzó a trabajar en la entidad. SiteCorp utilizará esta fecha para calcular su antigüedad. Use DD/MM/AAAA o una fecha real de Excel. No puede ser futura."],
    ["Fechas", "Use DD/MM/YYYY o una fecha real de Excel."],
    ["Sexo / Estado civil / Color / Nivel", "Use el nombre del catálogo existente en la entidad/aplicación."],
    ["Tiene licencia", "Sí/No. Indique además las categorías separadas por coma cuando corresponda."],
    ["Puesto", "La carga inicial no asigna puestos: los trabajadores quedan pendientes de vinculación y se asignan después desde Trabajadores."],
    ["Saldo y corte de vacaciones", "Ambos son opcionales. Un saldo vacío queda desconocido; no se asume cero."],
    ["Flujo", "Complete la hoja Trabajadores, pulse Validar para revisar el Preview y luego Iniciar carga para crear los trabajadores."],
  ])
  instructions.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  instructions.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174A67" } }
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

export function downloadWorkerMigrationTemplate(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "Plantilla_Carga_Inicial_Trabajadores.xlsx"
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Clasificación de los errores de estructura del archivo de plantilla.
 * Permite a la UI mostrar un mensaje accionable sin exponer detalles internos.
 * No cambia ninguna regla de validación: solo expone de forma tipada el error
 * que el parser ya detectaba.
 */
export type WorkerMigrationFileErrorCode = "MISSING_COLUMNS" | "SHEET_MISSING" | "INVALID_FILE"

export class WorkerMigrationTemplateError extends Error {
  readonly code: WorkerMigrationFileErrorCode
  readonly missingColumns: string[]

  constructor(code: WorkerMigrationFileErrorCode, message: string, missingColumns: string[] = []) {
    super(message)
    this.name = "WorkerMigrationTemplateError"
    this.code = code
    this.missingColumns = missingColumns
  }
}

export async function readWorkerMigrationExcel(file: File): Promise<MigrationRow[]> {
  if (file.size > 10 * 1024 * 1024) throw new WorkerMigrationTemplateError("INVALID_FILE", "El archivo supera el límite de 10 MB.")
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new WorkerMigrationTemplateError("INVALID_FILE", "Seleccione un archivo .xlsx válido.")
  const mod: ExcelJSModule = await import("exceljs")
  const ExcelJS = mod?.default ?? mod
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.getWorksheet("Trabajadores") || workbook.worksheets[0]
  if (!sheet) throw new WorkerMigrationTemplateError("SHEET_MISSING", "El archivo no contiene ninguna hoja de trabajo.")
  const indexHeaders = (rowNumber: number) => {
    const map = new Map<string, number>()
    sheet.getRow(rowNumber).eachCell((cell: Cell, column: number) => map.set(excelText(cell.value).toLowerCase(), column))
    return map
  }
  // Busca la fila de encabezados en las primeras filas (por si hay títulos previos).
  let headerRow = 1
  let headerIndex = indexHeaders(1)
  for (let candidate = 1; candidate <= Math.min(5, sheet.rowCount); candidate += 1) {
    const map = indexHeaders(candidate)
    if (map.has("identificación")) {
      headerRow = candidate
      headerIndex = map
      break
    }
  }
  const required = ["identificación", "nombre", "primer apellido", "fecha de incorporación"]
  const missing = required.filter((header) => !headerIndex.has(header))
  if (missing.length) {
    throw new WorkerMigrationTemplateError(
      "MISSING_COLUMNS",
      `Faltan columnas requeridas: ${missing.join(", ")}.`,
      missing,
    )
  }
  // Las columnas ausentes en el archivo NO deben romper la lectura. La plantilla
  // oficial omite "Fecha nacimiento" (se deriva de la identificación) y
  // "Código Puesto" (la carga inicial no vincula puestos). Nunca se debe pedir a
  // exceljs una columna inexistente: getCell(0) lanza una excepción.
  const get = (row: Row, header: string): unknown => {
    const column = headerIndex.get(header.toLowerCase())
    return column ? row.getCell(column).value : undefined
  }
  const rows: MigrationRow[] = []
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const nonEmpty = row.values?.some((value: unknown) => excelText(value) !== "")
    if (!nonEmpty) continue
    const licensesText = excelText(get(row, "Categorías licencia"))
    const licenses = licensesText.split(/[;,]/).map((value) => value.trim()).filter(Boolean)
    const hasLicense = excelText(get(row, "Tiene licencia")).toLowerCase()
    rows.push({
      identification: excelText(get(row, "Identificación")),
      first_name: excelText(get(row, "Nombre")),
      first_surname: excelText(get(row, "Primer apellido")),
      second_surname: excelText(get(row, "Segundo apellido")),
      birth_date: excelDate(get(row, "Fecha nacimiento")),
      gender_id: excelText(get(row, "Sexo")),
      marital_status_id: excelText(get(row, "Estado civil")),
      skin_color_id: excelText(get(row, "Color de piel")),
      phone: excelText(get(row, "Teléfono")),
      email: excelText(get(row, "Correo")),
      address: excelText(get(row, "Dirección")),
      province: excelText(get(row, "Provincia")),
      municipality: excelText(get(row, "Municipio")),
      employment_start_date: excelDate(get(row, "Fecha de incorporación")),
      education_level_id: excelText(get(row, "Nivel educacional")),
      specialty: excelText(get(row, "Especialidad")),
      profession_or_trade: excelText(get(row, "Profesión u oficio")),
      driving_license_category_ids: hasLicense === "no" ? [] : licenses,
      position_code: excelText(get(row, "Código Puesto")),
      initial_vacation_balance: decimalText(get(row, "Saldo inicial vacaciones")),
      vacation_cutoff_date: excelDate(get(row, "Fecha corte vacaciones")),
    })
  }
  if (!rows.length) throw new Error("No se encontraron filas de trabajadores para validar.")
  return rows
}

export async function mapMigrationRows(rows: MigrationRow[]): Promise<MigrationRow[]> {
  const [genders, marital, skin, education, licenses] = await Promise.all([
    supabase.from("genders").select("id,name"),
    supabase.from("marital_statuses").select("id,name"),
    supabase.from("skin_colors").select("id,name"),
    supabase.from("education_levels").select("id,name"),
    supabase.from("driving_license_categories").select("id,name,code"),
  ])
  for (const result of [genders, marital, skin, education, licenses]) if (result.error) throw result.error
  const genderMap = catalogMaps(genders.data || [])
  const maritalMap = catalogMaps(marital.data || [])
  const skinMap = catalogMaps(skin.data || [])
  const educationMap = catalogMaps(education.data || [])
  const licenseMap = catalogMaps(licenses.data || [])
  return rows.map((row) => ({
    ...row,
    // Reutiliza la lógica existente de SiteCorp (ciToBirthDate) para derivar la
    // fecha de nacimiento de la identificación. Nunca inventa una fecha.
    birth_date: row.birth_date || ciToBirthDate(row.identification) || "",
    gender_id: mapCatalogValue(row.gender_id, genderMap),
    marital_status_id: mapCatalogValue(row.marital_status_id, maritalMap),
    skin_color_id: mapCatalogValue(row.skin_color_id, skinMap),
    education_level_id: mapCatalogValue(row.education_level_id, educationMap),
    driving_license_category_ids: row.driving_license_category_ids.map((value) => mapCatalogValue(value, licenseMap)),
  }))
}

export async function validateWorkerMigration(entityId: string, rows: MigrationRow[]): Promise<MigrationPreviewRow[]> {
  const [backend, genders, marital, skins, education, licenses] = await Promise.all([
    supabase.rpc("migration_validate_rows", { p_entity_id: entityId, p_rows: rows }),
    supabase.from("genders").select("id"),
    supabase.from("marital_statuses").select("id"),
    supabase.from("skin_colors").select("id"),
    supabase.from("education_levels").select("id"),
    supabase.from("driving_license_categories").select("id"),
  ])
  if (backend.error) throw backend.error
  for (const result of [genders, marital, skins, education, licenses]) if (result.error) throw result.error
  const catalogs = {
    gender_id: new Set((genders.data || []).map((item) => item.id)),
    marital_status_id: new Set((marital.data || []).map((item) => item.id)),
    skin_color_id: new Set((skins.data || []).map((item) => item.id)),
    education_level_id: new Set((education.data || []).map((item) => item.id)),
    driving_license_category_ids: new Set((licenses.data || []).map((item) => item.id)),
  }
  const result = (backend.data || []) as MigrationPreviewRow[]
  return result.map((item, index) => {
    const row = rows[index]
    const errors: string[] = []
    const warnings: string[] = []
    const addCatalogError = (key: "gender_id" | "marital_status_id" | "skin_color_id" | "education_level_id", label: string) => {
      const value = row[key]
      if (value && !catalogs[key].has(value)) errors.push(`${label} no existe en el catálogo.`)
    }
    addCatalogError("gender_id", "Sexo")
    addCatalogError("marital_status_id", "Estado civil")
    addCatalogError("skin_color_id", "Color de piel")
    addCatalogError("education_level_id", "Nivel educacional")
    if (row.driving_license_category_ids.some((id) => !catalogs.driving_license_category_ids.has(id))) {
      errors.push("Una o más categorías de licencia no existen en el catálogo.")
    }
    // Número de Identificación: exactamente 11 dígitos (0-9), como texto.
    if (!/^[0-9]{11}$/.test(String(row.identification || "").trim())) {
      errors.push("El número de identificación debe contener exactamente 11 dígitos.")
    }
    for (const [date, label] of [[row.birth_date, "Fecha de nacimiento"], [row.employment_start_date, "Fecha de incorporación"], [row.vacation_cutoff_date, "Fecha de corte de vacaciones"]]) {
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`${label} inválida.`)
    }
    if (row.initial_vacation_balance) {
      const amount = Number(row.initial_vacation_balance)
      if (!Number.isFinite(amount) || amount < 0 || amount > 24) errors.push("Saldo inicial de vacaciones inválido; debe estar entre 0 y 24 días.")
    }

    // Información que puede completarse posteriormente. No bloquea la carga.
    const incomplete: string[] = []
    if (!row.birth_date) incomplete.push("fecha de nacimiento")
    if (!row.gender_id) incomplete.push("sexo")
    if (!row.marital_status_id) incomplete.push("estado civil")
    if (!row.skin_color_id) incomplete.push("color de piel")
    if (!row.address) incomplete.push("dirección")
    if (incomplete.length) {
      warnings.push(`Información incompleta: falta ${incomplete.join(", ")}. Podrá completarse después desde Trabajadores.`)
    }

    const messages = [...item.messages, ...errors, ...warnings]
    // El aviso de "pendiente de vinculación" del backend es el estado normal de
    // la carga inicial: no degrada la fila a advertencia por sí mismo.
    const status: MigrationPreviewRow["status"] =
      item.status === "ERROR" || errors.length > 0
        ? "ERROR"
        : warnings.length > 0
          ? "WARNING"
          : "VALID"
    return { ...item, status, messages }
  })
}

export interface WorkerMigrationImportResult {
  total_rows: number
  imported: number
  worker_ids: string[]
  /** Identificaciones repetidas dentro del archivo o ya existentes en el workspace.
   * La carga NO se bloqueó por ellas: las personas se crearon y solo deben corregirse. */
  duplicate_identifications: string[]
}

export async function importWorkerMigration(entityId: string, rows: MigrationRow[], batchId: string) {
  const { data, error } = await supabase.rpc("migration_import_rows", {
    p_entity_id: entityId,
    p_rows: rows,
    p_batch_id: batchId,
  })
  if (error) throw error
  const result = data as WorkerMigrationImportResult
  return { ...result, duplicate_identifications: result.duplicate_identifications || [] }
}

export async function createMigratedWorker(entityId: string, row: MigrationRow) {
  const { data, error } = await supabase.rpc("migration_create_single_worker", { p_entity_id: entityId, p_row: row })
  if (error) throw error
  return data as { worker_id: string; code: string; assignment_id: string | null; contract_id: string | null }
}

export async function linkMigratedWorker(workerId: string, positionId: string) {
  const { data, error } = await supabase.rpc("link_worker_to_position", {
    p_worker_id: workerId,
    p_position_id: positionId,
    p_start_date: null,
  })
  if (error) throw error
  return data as { assignment_id: string; position_id: string; position_name: string; start_date: string }
}
