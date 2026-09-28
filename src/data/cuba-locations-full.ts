// Dataset de provincias y municipios de Cuba utilizado por Candidatos y
// Trabajadores (fuente única; no duplicar en componentes).

export const CUBA_PROVINCES_FULL = [
  "Pinar del Río", "Artemisa", "La Habana", "Mayabeque", "Matanzas",
  "Cienfuegos", "Villa Clara", "Sancti Spíritus", "Ciego de Ávila",
  "Camagüey", "Las Tunas", "Holguín", "Granma", "Santiago de Cuba",
  "Guantánamo", "Isla de la Juventud",
]

export const MUNICIPIOS_BY_PROVINCE_FULL: Record<string, string[]> = {
  "Pinar del Río": ["Pinar del Río", "San Luis", "Sandino", "Consolación del Sur", "Guane", "Mantua", "Viñales", "La Palma", "Los Palacios", "San Juan y Martínez", "San Cristóbal"],
  "Artemisa": ["Artemisa", "Bauta", "Caimito", "Guanajay", "Güines", "Mariel", "San Antonio de los Baños", "San José de las Lajas"],
  "La Habana": ["La Habana Vieja", "Centro Habana", "Plaza de la Revolución", "Cerro", "Marianao", "10 de Octubre", "La Lisa", "Playa", "Miramar", "Regla", "Guanabacoa", "San Miguel del Padrón", "Diez de Octubre", "Boyeros", "Cotorro", "San José de las Lajas"],
  "Mayabeque": ["San José de las Lajas", "Güines", "Batabanó", "Bejucal", "San Nicolás de Bari", "Santa Cruz del Norte", "Nueva Paz", "San Nicolás", "Madruga", "Melena del Sur", "Quivicán"],
  "Matanzas": ["Matanzas", "Cárdenas", "Colón", "Jagüey Grande", "Jovellanos", "Pedro Betancourt", "Unión de Reyes", "Calimete", "Corralillo", "Guaguasi", "Limonar", "Perico", "Martí"],
  "Cienfuegos": ["Cienfuegos", "Abreus", "Aguada de Pasajeros", "Cumanayagua", "Lajas", "Palmira", "Rodas", "Cumanayagua"],
  "Villa Clara": ["Santa Clara", "Camajuaní", "Caibarién", "Placetas", "Sagua la Grande", "Manicaragua", "Remedios", "Cifuentes", "Santo Domingo", "Zulueta"],
  "Sancti Spíritus": ["Sancti Spíritus", "Trinidad", "Fomento", "Yaguajay", "Zaza del Medio", "Jatibonico", "La Sierpe", "Taguasco", "Tuinicú"],
  "Ciego de Ávila": ["Ciego de Ávila", "Morón", "Baraguá", "Chambas", "Majagua", "Ciro Redondo", "Venezuela", "Florencia"],
  "Camagüey": ["Camagüey", "Nuevitas", "Florida", "Sierra de Cubitas", "Esmeralda", "Vertientes", "Jimaguayú", "Najasa", "Santa Cruz del Sur", "Sibanicú", "Guáimaro"],
  "Las Tunas": ["Las Tunas", "Manatí", "Puerto Padre", "Colombia", "Jesús Menéndez", "Jobabo", "Amancio", "Cauto Cristo"],
  "Holguín": ["Holguín", "Banes", "Frank País", "Mayarí", "Antilla", "Báguanos", "Cacocum", "Cueto", "Gibara", "Rafael Freyre", "Río Cauto", "Sagua de Tánamo"],
  "Granma": ["Bayamo", "Manzanillo", "Jiguaní", "Buey Arriba", "Campechuela", "Cauto Cristo", "Guisa", "Jiguaní", "Niquero", "Pilón", "Yara"],
  "Santiago de Cuba": ["Santiago de Cuba", "Contramaestre", "Guamá", "Mella", "Palma Soriano", "San Luis", "Siboney", "Tercer Frente", "Segundo Frente", "Baconao"],
  "Guantánamo": ["Guantánamo", "Baracoa", "Caimanera", "El Salvador", "Maisí", "Manuel Tames", "Niceto Pérez", "San Antonio del Sur", "Yateras"],
  "Isla de la Juventud": ["Nueva Gerona", "Santa Fe"],
}
