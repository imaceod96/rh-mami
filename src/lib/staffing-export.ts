import { supabase } from "@/lib/supabase"
import { toRomanNumeral } from "@/utils/roman-numerals"

/**
 * ANEXO 14 — «REGISTRO DE TRABAJADORES / a) Registro de principales datos».
 *
 * Es la exportación de la PLANTILLA ORGANIZATIVA de la entidad (la descarga
 * existente de «Plantilla → Descargar Plantilla»). Se construye desde
 * Área → Cargo → Puesto/capacidad autorizada → Trabajador que ocupa la
 * capacidad, si existe, de modo que el documento muestra la plantilla
 * autorizada Y su ocupación real: las capacidades vacantes NO desaparecen.
 *
 * Toda la información se obtiene del backend (`entity_staffing_export`), que
 * aplica la autorización (`can_access_entity` → workers.view/manage), expande
 * cada Puesto en `authorized_quantity` capacidades, coloca primero los
 * trabajadores con Assignment ACTUAL válido y deja el resto vacías, con el
 * orden organizativo ya resuelto.
 *
 * No depende de ningún período de Prenómina: no usa noches trabajadas,
 * snapshots ni totales mensuales.
 */

export interface StaffingExportRow {
  area_id: string | null
  area_name: string | null
  job_id: string | null
  job_name: string | null
  position_id: string | null
  position_name: string | null
  occupational_category: string | null
  worker_id: string | null
  worker_name: string | null
  gender_code: string | null
  identification: string | null
  preparation_level: string | null
  salary_group_sequence: number | null
  salary: number | null
  cla_amount: number | null
  academic_amount: number | null
  academic_category: string | null
  service_start: string | null
  has_masters_degree: boolean | null
  has_doctorate_degree: boolean | null
}

/** Cabecera de las 15 informaciones del modelo oficial. */
export const ANEXO14_HEADERS = [
  "No",
  "Órgano y Cargos",
  "Categoría ocupacional",
  "Nombres y Apellidos del Trabajador",
  "Sexo",
  "Carnet de Identidad",
  "Nivel de Preparación",
  "Grupo Escala",
  "Total",
  "Escala",
  "CLA",
  "Turnos Nocturnos y Mixtos",
  "Maestría o Doctorado",
  "Años de Servicios",
  "Otros",
] as const

const COLUMN_WIDTHS = [5, 34, 18, 30, 7, 15, 18, 11, 13, 12, 11, 16, 17, 15, 11]

/** Índices (1-based) de las columnas monetarias. */
const MONEY_COLUMNS = [9, 10, 11, 12, 13, 15]

const CI_COLUMN = 6
const FIRST_SALARY_COLUMN = 9
const LAST_COLUMN = ANEXO14_HEADERS.length

const HEADER_ROW_TOP = 6
const HEADER_ROW_BOTTOM = 7
const NUMBERING_ROW = 8
const FIRST_DATA_ROW = 9

const THIN_BORDER = {
  top: { style: "thin" as const },
  left: { style: "thin" as const },
  bottom: { style: "thin" as const },
  right: { style: "thin" as const },
}

/** Colores sobrios de documento administrativo. */
const SALARY_HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFDCE6F1" },
}
const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF3F6FA" } }
const AREA_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEAEEF3" } }

/** Consulta las capacidades de plantilla ya expandidas y ordenadas (RPC backend). */
export async function fetchStaffingExportRows(entityId: string): Promise<StaffingExportRow[]> {
  const { data, error } = await supabase.rpc("entity_staffing_export", { p_entity_id: entityId })
  if (error) throw error

  const toNumberOrNull = (value: unknown): number | null =>
    value === null || value === undefined ? null : Number(value)

  return ((data as StaffingExportRow[]) || []).map((row) => ({
    ...row,
    salary_group_sequence: toNumberOrNull(row.salary_group_sequence),
    salary: toNumberOrNull(row.salary),
    cla_amount: toNumberOrNull(row.cla_amount),
    academic_amount: toNumberOrNull(row.academic_amount),
    service_start: row.service_start ? String(row.service_start).slice(0, 10) : null,
  }))
}

/** Nombre saneado: Anexo_14_Registro_Trabajadores_[Entidad].xlsx */
export function buildAnexo14FileName(entityName: string): string {
  const safeName =
    (entityName || "Entidad")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || "Entidad"
  return `Anexo_14_Registro_Trabajadores_${safeName}.xlsx`
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
 * Años de servicios desde `workers.employment_start_date` hasta la fecha de
 * generación del Anexo: «12 años» o «12 años, 4 meses».
 */
export function formatService(
  serviceStart: string | null | undefined,
  reference: Date
): string | null {
  if (!serviceStart) return null
  const start = new Date(`${String(serviceStart).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null

  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
  if (start > ref) return null

  let years = ref.getFullYear() - start.getFullYear()
  let months = ref.getMonth() - start.getMonth()
  if (ref.getDate() < start.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years < 0) return null

  const yearsLabel = years === 1 ? "1 año" : `${years} años`
  if (months <= 0) return yearsLabel
  return `${yearsLabel}, ${months} ${months === 1 ? "mes" : "meses"}`
}

export interface StaffingExportMeta {
  entityName: string
  generatedAt: Date
}

interface AreaGroup {
  areaLabel: string
  rows: StaffingExportRow[]
}

/** Agrupa por Área respetando el orden organizativo devuelto por el backend. */
function groupByArea(rows: StaffingExportRow[]): AreaGroup[] {
  const groups: AreaGroup[] = []
  rows.forEach((row) => {
    const label = (row.area_name || "").trim() || "SIN ÁREA ASIGNADA"
    let group = groups.find((candidate) => candidate.areaLabel === label)
    if (!group) {
      group = { areaLabel: label, rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  })
  return groups
}

/**
 * TOTAL salarial estructural del registro: suma ÚNICAMENTE los conceptos
 * monetarios realmente disponibles (Escala + CLA + categoría académica).
 * No suma «Años de Servicios» (es tiempo, no importe) y no inventa conceptos:
 * si ningún concepto tiene valor, la celda queda vacía.
 */
function computeTotal(row: StaffingExportRow): number | null {
  const components = [row.salary, row.cla_amount, row.academic_amount].filter(
    (value): value is number => value !== null && value !== undefined
  )
  if (components.length === 0) return null
  return Math.round(components.reduce((sum, value) => sum + value, 0) * 100) / 100
}

/**
 * Genera el .xlsx del Anexo 14 (hoja «Anexo 14»).
 * `exceljs` se importa dinámicamente, igual que en el resto de exportaciones.
 */
export async function buildStaffingWorkbookBlob(
  rows: StaffingExportRow[],
  meta: StaffingExportMeta
): Promise<Blob> {
  const mod: any = await import("exceljs")
  const ExcelJS = mod?.default ?? mod

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "SiteCorp"
  workbook.created = meta.generatedAt

  const sheet = workbook.addWorksheet("Anexo 14", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      printTitlesRow: `${HEADER_ROW_TOP}:${NUMBERING_ROW}`,
    } as any,
  })

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }))

  // ---------- Cabecera del documento ----------
  sheet.mergeCells(1, 1, 1, 13)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = "REGISTRO DE TRABAJADORES"
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { vertical: "middle" }

  sheet.mergeCells(1, 14, 1, LAST_COLUMN)
  const annexCell = sheet.getCell(1, 14)
  annexCell.value = "ANEXO 14"
  annexCell.font = { bold: true, size: 14 }
  annexCell.alignment = { vertical: "middle", horizontal: "right" }
  sheet.getRow(1).height = 22

  sheet.mergeCells(2, 1, 2, LAST_COLUMN)
  const subtitleCell = sheet.getCell(2, 1)
  subtitleCell.value = "a) Registro de principales datos"
  subtitleCell.font = { bold: true, size: 11, italic: true }

  sheet.getCell(3, 1).value = "Entidad:"
  sheet.getCell(3, 1).font = { bold: true }
  sheet.mergeCells(3, 2, 3, LAST_COLUMN)
  sheet.getCell(3, 2).value = meta.entityName || "—"

  sheet.getCell(4, 1).value = "Fecha:"
  sheet.getCell(4, 1).font = { bold: true }
  sheet.mergeCells(4, 2, 4, LAST_COLUMN)
  sheet.getCell(4, 2).value = meta.generatedAt.toLocaleDateString("es-CU")

  // ---------- Cabecera multinivel (SALARIO sobre las columnas 9–15) ----------
  for (let column = 1; column < FIRST_SALARY_COLUMN; column += 1) {
    sheet.mergeCells(HEADER_ROW_TOP, column, HEADER_ROW_BOTTOM, column)
    const cell = sheet.getCell(HEADER_ROW_TOP, column)
    cell.value = ANEXO14_HEADERS[column - 1]
    cell.font = { bold: true }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.fill = HEADER_FILL
  }

  sheet.mergeCells(HEADER_ROW_TOP, FIRST_SALARY_COLUMN, HEADER_ROW_TOP, LAST_COLUMN)
  const salaryCell = sheet.getCell(HEADER_ROW_TOP, FIRST_SALARY_COLUMN)
  salaryCell.value = "SALARIO"
  salaryCell.font = { bold: true }
  salaryCell.alignment = { vertical: "middle", horizontal: "center" }
  salaryCell.fill = SALARY_HEADER_FILL

  for (let column = FIRST_SALARY_COLUMN; column <= LAST_COLUMN; column += 1) {
    const cell = sheet.getCell(HEADER_ROW_BOTTOM, column)
    cell.value = ANEXO14_HEADERS[column - 1]
    cell.font = { bold: true }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.fill = SALARY_HEADER_FILL
  }

  for (let row = HEADER_ROW_TOP; row <= HEADER_ROW_BOTTOM; row += 1) {
    for (let column = 1; column <= LAST_COLUMN; column += 1) {
      sheet.getCell(row, column).border = THIN_BORDER
    }
  }
  sheet.getRow(HEADER_ROW_TOP).height = 20
  sheet.getRow(HEADER_ROW_BOTTOM).height = 30

  // ---------- Fila de numeración (igual que el modelo oficial) ----------
  for (let column = 1; column <= LAST_COLUMN; column += 1) {
    const cell = sheet.getCell(NUMBERING_ROW, column)
    cell.value = column
    cell.font = { bold: false, size: 9, color: { argb: "FF6B7280" } }
    cell.alignment = { horizontal: "center" }
    cell.border = THIN_BORDER
  }

  // ---------- Área → capacidades del Puesto ----------
  const groups = groupByArea(rows)
  let ordinal = 0
  let currentRow = FIRST_DATA_ROW

  groups.forEach((group) => {
    const areaRow = sheet.getRow(currentRow)
    sheet.mergeCells(currentRow, 1, currentRow, LAST_COLUMN)
    const areaCell = sheet.getCell(currentRow, 1)
    areaCell.value = group.areaLabel.toLocaleUpperCase("es-CU")
    areaCell.font = { bold: true }
    areaCell.fill = AREA_FILL
    areaCell.alignment = { vertical: "middle" }
    for (let column = 1; column <= LAST_COLUMN; column += 1) {
      const cell = sheet.getCell(currentRow, column)
      cell.fill = AREA_FILL
      cell.border = THIN_BORDER
    }
    areaRow.height = 18
    currentRow += 1

    group.rows.forEach((row) => {
      ordinal += 1
      const rowValues = [
        ordinal,
        // Columna 2: «Órgano y Cargos» = Cargo/Puesto real (el Área ya es fila separadora).
        row.position_name || row.job_name || "—",
        row.occupational_category || null,
        row.worker_name || null,
        row.gender_code || null,
        row.identification || null,
        row.preparation_level || null,
        ROMAN_SAFE(row.salary_group_sequence),
        computeTotal(row),
        row.salary,
        row.cla_amount,
        null, // Turnos Nocturnos y Mixtos: sin fuente estructural definida todavía.
        row.academic_amount,
        formatService(row.service_start, meta.generatedAt),
        null, // Otros: pendiente de definición de conceptos.
      ]

      const excelRow = sheet.getRow(currentRow)
      rowValues.forEach((value, index) => {
        excelRow.getCell(index + 1).value = value === undefined ? null : value
      })

      // Carnet de identidad SIEMPRE como texto: conserva ceros iniciales y dígitos.
      const ciCell = excelRow.getCell(CI_COLUMN)
      ciCell.numFmt = "@"
      if (row.identification !== null && row.identification !== undefined) {
        ciCell.value = String(row.identification)
      }

      MONEY_COLUMNS.forEach((column) => {
        const cell = excelRow.getCell(column)
        if (cell.value !== null && cell.value !== undefined) {
          cell.numFmt = "#,##0.00"
        }
        cell.alignment = { vertical: "middle", horizontal: "right" }
      })

      excelRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" }
      excelRow.getCell(1).numFmt = "0"
      excelRow.getCell(5).alignment = { vertical: "middle", horizontal: "center" }
      excelRow.getCell(6).alignment = { vertical: "middle", horizontal: "center" }
      excelRow.getCell(8).alignment = { vertical: "middle", horizontal: "center" }
      excelRow.getCell(2).alignment = { vertical: "middle", wrapText: true }
      excelRow.getCell(3).alignment = { vertical: "middle", wrapText: true }
      excelRow.getCell(4).alignment = { vertical: "middle", wrapText: true }
      excelRow.getCell(7).alignment = { vertical: "middle", wrapText: true }
      excelRow.getCell(14).alignment = { vertical: "middle", horizontal: "center" }

      for (let column = 1; column <= LAST_COLUMN; column += 1) {
        excelRow.getCell(column).border = THIN_BORDER
      }

      currentRow += 1
    })
  })

  // ---------- Impresión ----------
  sheet.headerFooter = {
    oddHeader: '&L&"Calibri,Bold"REGISTRO DE TRABAJADORES - ANEXO 14&R&"Calibri"&A',
    oddFooter: "&C&P de &N",
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

/** Dispara la descarga del Anexo 14 generado en el navegador. */
export function saveStaffingExcelBlob(blob: Blob, entityName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = buildAnexo14FileName(entityName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
