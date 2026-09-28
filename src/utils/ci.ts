// Deriva la fecha de nacimiento (YYYY-MM-DD) de los primeros 6 dígitos del
// carné de identidad cubano (AAMMDD). Devuelve null si el CI no permite
// derivar una fecha válida.
export const ciToBirthDate = (ci: string): string | null => {
  const cleaned = ci.replace(/\D/g, "")
  if (cleaned.length < 6) return null

  const year = parseInt(cleaned.substring(0, 2), 10)
  const month = parseInt(cleaned.substring(2, 4), 10)
  const day = parseInt(cleaned.substring(4, 6), 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const fullYear = year >= 50 ? 1900 + year : 2000 + year
  const date = new Date(fullYear, month - 1, day)

  // Descartar fechas inválidas (p. ej. 3102)
  if (date.getDate() !== day || date.getMonth() !== month - 1) return null

  return date.toISOString().split("T")[0]
}
