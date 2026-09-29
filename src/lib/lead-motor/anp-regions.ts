/**
 * Regiões comerciais / geográficas por UF (PostoCred pilot).
 * Cidades referem-se aos nomes oficiais em ANP_CITIES_BY_UF.
 */

export type AnpRegionDef = {
  id: string;
  label: string;
  /** Nomes oficiais das cidades incluídas na região */
  cities: string[];
};

const RS_SUL: string[] = [
  "Pelotas",
  "Rio Grande",
  "Bagé",
  "Santana do Livramento",
  "Canguçu",
  "São Lourenço do Sul",
  "Alegrete",
  "Camaquã",
  "Santiago",
  "São Gabriel",
  "Rosário do Sul",
  "São Borja",
  "Jaguarão",
  "Santa Vitória do Palmar",
  "Uruguaiana"
];

const RS_SERRA: string[] = [
  "Caxias do Sul",
  "Bento Gonçalves",
  "Farroupilha",
  "Garibaldi",
  "Carlos Barbosa",
  "Flores da Cunha",
  "Nova Prata",
  "Veranópolis",
  "Vacaria",
  "Gramado",
  "Canela",
  "Nova Petrópolis",
  "São Marcos",
  "Antônio Prado",
  "Guaporé"
];

/** Região Metropolitana de Porto Alegre (52 cidades — config PostoCred). */
const RS_RM_POA: string[] = [
  "Alvorada",
  "Araricá",
  "Arroio dos Ratos",
  "Barão do Triunfo",
  "Bom Princípio",
  "Brochier",
  "Butiá",
  "Cachoeirinha",
  "Campo Bom",
  "Canela",
  "Canoas",
  "Capão da Canoa",
  "Capela de Santana",
  "Charqueadas",
  "Dois Irmãos",
  "Eldorado do Sul",
  "Encantado",
  "Esteio",
  "Estância Velha",
  "Feliz",
  "General Câmara",
  "Glorinha",
  "Gramado",
  "Gravataí",
  "Guaíba",
  "Igrejinha",
  "Ivoti",
  "Lajeado",
  "Maratá",
  "Montenegro",
  "Nova Hartz",
  "Nova Petrópolis",
  "Nova Santa Rita",
  "Novo Hamburgo",
  "Osório",
  "Parobé",
  "Porto Alegre",
  "Portão",
  "Rolante",
  "Santa Cruz do Sul",
  "Santo Antônio da Patrulha",
  "Sapiranga",
  "Sapucaia do Sul",
  "São Jerônimo",
  "São Leopoldo",
  "São Sebastião do Caí",
  "Taquara",
  "Tramandaí",
  "Triunfo",
  "Tunas",
  "Vale Real",
  "Viamão"
];

const PR_RM_CURITIBA: string[] = [
  "Curitiba",
  "São José dos Pinhais",
  "Pinhais",
  "Colombo",
  "Araucária",
  "Fazenda Rio Grande",
  "Campo Largo",
  "Almirante Tamandaré",
  "Piraquara",
  "Campina Grande do Sul",
  "Quatro Barras",
  "Campo Magro",
  "Rio Branco do Sul",
  "Lapa",
  "Mandirituba",
  "Bocaiúva do Sul",
  "Contenda",
  "Cerro Azul",
  "Rio Negro",
  "Balsa Nova",
  "Campo do Tenente",
  "Antonina",
  "Adrianópolis",
  "Agudos do Sul",
  "Doutor Ulysses",
  "Itaperuçu",
  "Piên",
  "Tijucas do Sul",
  "Tunas do Paraná"
];

export const ANP_REGIONS_BY_UF: Record<string, AnpRegionDef[]> = {
  RS: [
    { id: "rs_capital", label: "Capital (Porto Alegre)", cities: ["Porto Alegre"] },
    { id: "rs_rm_poa", label: "Região Metropolitana de Porto Alegre", cities: RS_RM_POA },
    { id: "rs_serra", label: "Serra Gaúcha", cities: RS_SERRA },
    { id: "rs_sul", label: "Sul RS / Campanha", cities: RS_SUL }
  ],
  PR: [
    { id: "pr_capital", label: "Capital (Curitiba)", cities: ["Curitiba"] },
    { id: "pr_rm_curitiba", label: "Curitiba e Região Metropolitana", cities: PR_RM_CURITIBA }
  ]
};

export function listRegionsForUf(uf: string): AnpRegionDef[] {
  return ANP_REGIONS_BY_UF[uf.toUpperCase()] ?? [];
}

export function regionById(uf: string, regionId: string): AnpRegionDef | undefined {
  return listRegionsForUf(uf).find((r) => r.id === regionId);
}

export function citiesForRegionIds(uf: string, regionIds: string[]): string[] {
  const u = uf.toUpperCase();
  const out = new Set<string>();
  for (const id of regionIds) {
    const reg = regionById(u, id);
    if (!reg) continue;
    for (const c of reg.cities) out.add(c);
  }
  return [...out];
}
