// Cuba provinces and municipalities data
export const CUBA_PROVINCES = [
  "Artemisa",
  "Mayabeque", 
  "Matanzas",
  "Cienfuegos",
  "Villa Clara",
  "Sancti Spiritus",
  "Ciego de Avila",
  "Camaguey",
  "Las Tunas",
  "Holguin",
  "Granma",
  "Santiago de Cuba",
  "Guantanamo"
].map(name => ({ id: name, name }));

export const MUNICIPIOS_BY_PROVINCE = {
  Artemisa: ["Artemisa", "Guanajay", "San Antonio de los Banos"],
  Mayabeque: ["San Jose de las Lajas", "Santa Cruz del Norte", "Calimete"],
  Matanzas: ["Matanzas", "Cardenas", "Colon", "Jaguey Grande", "Pedro Betancourt", "Union de Reyes"],
  Cienfuegos: ["Cienfuegos", "Rodas", "Cruces", "Lajas", "Palmira"],
  "Villa Clara": ["Santa Clara", "Remedios", "Sagua la Grande", "Camajuani", "Manicaragua", "Placetas", "Quemado de Guines"],
  "Sancti Spiritus": ["Sancti Spiritus", "Yaguajay", "Trinidad", "Cumanayagua", "Fomento", "Jatibonico"],
  "Ciego de Avila": ["Ciego de Avila", "Moron", "Chambas", "Florencia", "Majagua", "Baragua"],
  Camaguey: ["Camaguey", "Las Tunas", "Santa Cruz del Sur", "Guaimaro", "Nuevitas", "Florida"],
  "Las Tunas": ["Las Tunas", "Manati", "Colombia", "Jobabo", "Calixto Garcia", "Puerto Padre"],
  Holguin: ["Holguin", "Baguanos", "Frank Pais", "Mayari", "Cueto", "Moa", "Rafael Freyre"],
  Granma: ["Bayamo", "Manzanillo", "Niquero", "Pilon", "Yara", "Cauto Cristo", "Jiguaní"],
  "Santiago de Cuba": ["Santiago de Cuba", "San Luis", "Songo-La Maya", "Contramaestre", "Palma Soriano", "Tercer Frente", "Guama"],
  Guantanamo: ["Guantanamo", "Baracoa", "Maisi", "Moa", "Niceto Perez", "Caimanera"]
} as const;

export type Province = typeof CUBA_PROVINCES[0];
export type Municipality = string;