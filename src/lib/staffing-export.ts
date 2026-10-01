import { supabase } from "@/lib/supabase"
import { toRomanNumeral } from "@/utils/roman-numerals"

/**
 * FASE 19 — Exportación de la plantilla completa a Excel (.xlsx).
 *
 * La plantilla NO es una tabla: se DERIVA de la arquitectura existente
 * (Área → Cargo → Puesto → Assignment). El backend (`entity_staffing_export`)
 * expande cada Puesto en `authorized_quantity` filas, coloca primero los
 * trabajadores actuales y deja filas con los campos personales vacíos.
 *
 * El backend aplica la autorización (`can_access_entity`) y devuelve el orden
 * organizativo ya resuelto (Área → Cargo → Puesto → trabajadores → vacías).
 */

export interface StaffingExportRow {
  area_name: string | null
  job_name: string | null
  occupational_category: string | null
  position_name: string | null
  worker_name: string | null
  identification: string | null
  gender_code: string | null
  skin_color_code: string | null
  education_level_code: string | null
  marital_status_code: string | null
  salary_group_sequence: number | null
  salary: number | null
}

export const STAFFING_EXPORT_HEADERS = [
  "Área",
  "Cargo",
  "Categoría ocupacional",
  "Puesto",
  "Nombre y apellidos",
  "Carnet de identidad",
  "Sexo",
  "Color de piel",
  "Nivel escolar",
  "Estado civil",
  "Grupo salarial",
  "Salario",
] as const

/** Anchos de columna (§52). */
const COLUMN_WIDTHS = [25, 28, 22, 28, 32, 20, 10, 14, 16, 14, 16, 16]

/** Consulta las filas de la plantilla ya expandidas y ordenadas (RPC backend). */
export async function fetchStaffingExportRows(entityId: string): Promise<StaffingExportRow[]> {
  const { data, error } = await supabase.rpc("entity_staffing_export", { p_entity_id: entityId })
  if (error) throw error
  return ((data as StaffingExportRow[]) || []).map((row) => ({
    ...row,
    salary: row.salary === null || row.salary === undefined ? null : Number(row.salary),
    salary_group_sequence:
      row.salary_group_sequence === null || row.salary_group_sequence === undefined
        ? null
        : Number(row.salary_group_sequence),
  }))
}

/** Nombre de archivo comprensible y saneado (§5). */
export function buildStaffingFileName(entityName: string, date = new Date()): string {
  const safeName =
    (entityName || "Entidad")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || "Entidad"
  const iso = date.toISOString().slice(0, 10)
  return `Plantilla_${safeName}_${iso}.xlsx`
}

const ROMAN_SAFE = (sequence: number | null): string | null => {
  if (sequence === null || sequence === undefined) return null
  try {
    return toRomanNumeral(sequence)
  } catch {
    return String(sequence)
  }
}

/**
 * Genera el .xlsx real (no CSV) con la hoja "Plantilla".
 * `exceljs` se importa dinámicamente para no cargarlo en el bundle inicial.
 */
export async function buildStaffingWorkbookBlob(rows: StaffingExportRow[]): Promise<Blob> {
  const mod: any = await import("exceljs")
  const ExcelJS = mod?.default ?? mod

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "SiteCorp"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet("Plantilla", {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  sheet.columns = STAFFING_EXPORT_HEADERS.map((header, index) => ({
    header,
    key: `c${index}`,
    width: COLUMN_WIDTHS[index],
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: "middle" }
  headerRow.height = 18

  rows.forEach((row) => {
    const added = sheet.addRow([
      row.area_name,
      row.job_name,
      row.occupational_category,
      row.position_name,
      row.worker_name,
      row.identification,
      row.gender_code,
      row.skin_color_code,
      row.education_level_code,
      row.marital_status_code,
      ROMAN_SAFE(row.salary_group_sequence),
      row.salary,
    ])

    // Carnet de identidad SIEMPRE como texto (§16/§58): nunca notación científica.
    const ciCell = added.getCell(6)
    ciCell.numFmt = "@"
    if (row.identification !== null && row.identification !== undefined) {
      ciCell.value = String(row.identification)
    }

    // Salario numérico (§25/§59): sumable y filtrable.
    const salaryCell = added.getCell(12)
    if (row.salary !== null && row.salary !== undefined) {
      salaryCell.value = row.salary
      salaryCell.numFmt = "#,##0.00"
    }
  })

  // AutoFilter sobre la fila de encabezados (§50).
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: STAFFING_EXPORT_HEADERS.length },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

/** Dispara la descarga del archivo generado en el navegador. */
export function saveStaffingExcelBlob(blob: Blob, entityName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = buildStaffingFileName(entityName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
