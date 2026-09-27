export const CUBA_PROVINCES = [
  "Artemisa",
  "Mayabeque",
  "Matanzas",
  "Cienfuegos",
  "Villa Clara",
  "Sancti Spíritus",
  "Ciego de Ávila",
  "Camagüey",
  "Las Tunas",
  "Holguín",
  "Granma",
  "Santiago de Cuba",
  "Guantánamo"
].map((name) => ({ id: name, name }));

export const MUNICIPIOS_BY_PROVINCE: Record<string, string[]> = {
  Artemisa: ["Artemisa", "Guanajay", "San Antonio de los Baños"],
  Mayabeque: ["San José de las Lajas", "Santa Cruz del Norte", "Calimete"],
  Matanzas: ["Matanzas", "Cárdenas", "Colón", "Jagüey Grande", "Pedro Betancourt", "Unión de Reyes"],
  Cienfuegos: ["Cienfuegos", "Rodas", "Cruces", "Lajas", "Palmira"],
  Villa Clara: ["Santa Clara", "Remedios", "Sagua la Grande", "Camajuaní", "Manicaragua", "Placetas", "Quemado de Güines"],
  Sancti Spíritus: ["Sancti Spíritus", "Yaguajay", "Trinidad", "Cumanayagua", "Fomento", "Jatibonico"],
  Ciego de Ávila: ["Ciego de Ávila", "Morón", "Chambas", "Florencia", "Majagua", "Baraguá"],
  Camagüey: ["Camagüey", "Las Tunas", "Santa Cruz del Sur", "Guáimaro", "Nuevitas", "Florida"],
  Las Tunas: ["Las Tunas", "Manatí", "Colombia", "Jobabo", "Calixto García", "Puerto Padre"],
  Holguín: ["Holguín", "Báguanos", "Frank País", "Mayarí", "Cueto", "Moa", "Rafael Freyre"],
  Granma: ["Bayamo", "Manzanillo", "Niquero", "Pilón", "Yara", "Cauto Cristo", "Jiguaní"],
  Santiago de Cuba: ["Santiago de Cuba", "San Luis", "Songo-La Maya", "Contramaestre", "Palma Soriano", "Tercer Frente", "Guamá"],
  Guantánamo: ["Guantánamo", "Baracoa", "Maisí", "Moa", "Niceto Pérez", "Caimanera"],
};

export type Province = (typeof CUBA_PROVINCES)[0];
export type Municipality = string;