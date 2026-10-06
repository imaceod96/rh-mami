import { supabase } from "@/lib/supabase"

export const MIGRATION_HEADERS = [
  "Identificación", "Nombre", "Primer apellido", "Segundo apellido", "Fecha nacimiento", "Sexo",
  "Estado civil", "Color de piel", "Teléfono", "Correo", "Dirección", "Provincia", "Municipio",
  "Fecha de incorporación", "Nivel educacional", "Especialidad", "Profesión u oficio", "Tiene licencia",
  "Categorías licencia", "Código Puesto", "Saldo inicial vacaciones", "Fecha corte vacaciones",
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
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
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
  const mod: any = await import("exceljs")
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
    ["Fechas", "Use DD/MM/YYYY o una fecha real de Excel. La fecha de incorporación es histórica."],
    ["Sexo / Estado civil / Color / Nivel", "Use el nombre del catálogo existente en la entidad/aplicación."],
    ["Tiene licencia", "Sí/No. Indique además las categorías separadas por coma cuando corresponda."],
    ["Código Puesto", "Opcional. Código existente y activo; vacío crea el trabajador pendiente de vinculación."],
    ["Saldo y corte de vacaciones", "Ambos son opcionales. Un saldo vacío queda desconocido; no se asume cero."],
    ["Importación", "Complete la hoja Trabajadores. Revise Preview y resuelva todos los errores antes de confirmar."],
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

export async function readWorkerMigrationExcel(file: File): Promise<MigrationRow[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo supera el límite de 10 MB.")
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Seleccione un archivo .xlsx válido.")
  const mod: any = await import("exceljs")
  const ExcelJS = mod?.default ?? mod
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.getWorksheet("Trabajadores")
  if (!sheet) throw new Error("El archivo debe incluir la hoja «Trabajadores».")
  const headerIndex = new Map<string, number>()
  sheet.getRow(1).eachCell((cell: any, column: number) => headerIndex.set(excelText(cell.value).toLowerCase(), column))
  const required = ["identificación", "nombre", "primer apellido", "fecha de incorporación"]
  const missing = required.filter((header) => !headerIndex.has(header))
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`)
  const get = (row: any, header: string) => row.getCell(headerIndex.get(header.toLowerCase()) || 0).value
  const rows: MigrationRow[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
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
    const messages = [...item.messages]
    const addCatalogError = (key: "gender_id" | "marital_status_id" | "skin_color_id" | "education_level_id", label: string) => {
      const value = row[key]
      if (value && !catalogs[key].has(value)) messages.push(`${label} no existe en el catálogo.`)
    }
    addCatalogError("gender_id", "Sexo")
    addCatalogError("marital_status_id", "Estado civil")
    addCatalogError("skin_color_id", "Color de piel")
    addCatalogError("education_level_id", "Nivel educacional")
    if (row.driving_license_category_ids.some((id) => !catalogs.driving_license_category_ids.has(id))) {
      messages.push("Una o más categorías de licencia no existen en el catálogo.")
    }
    for (const [date, label] of [[row.birth_date, "Fecha de nacimiento"], [row.employment_start_date, "Fecha de incorporación"], [row.vacation_cutoff_date, "Fecha de corte de vacaciones"]]) {
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) messages.push(`${label} inválida.`)
    }
    if (row.initial_vacation_balance) {
      const amount = Number(row.initial_vacation_balance)
      if (!Number.isFinite(amount) || amount < 0 || amount > 24) messages.push("Saldo inicial de vacaciones inválido; debe estar entre 0 y 24 días.")
    }
    return {
      ...item,
      status: messages.some((message) => !item.messages.includes(message)) || item.status === "ERROR" ? "ERROR" : item.status,
      messages,
    }
  })
}

export async function importWorkerMigration(entityId: string, rows: MigrationRow[], batchId: string) {
  const { data, error } = await supabase.rpc("migration_import_rows", {
    p_entity_id: entityId,
    p_rows: rows,
    p_batch_id: batchId,
  })
  if (error) throw error
  return data as { total_rows: number; imported: number; worker_ids: string[] }
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
