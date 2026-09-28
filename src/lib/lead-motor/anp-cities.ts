/** Mapas oficial → API ANP (sem acento, maiúsculas). Fonte: contabilidade-leads-pilot. */

export const ANP_CITIES_BY_UF: Record<string, Record<string, string>> = {
  RS: {
    Alvorada: "ALVORADA",
    Araricá: "ARARICA",
    "Arroio dos Ratos": "ARROIO DOS RATOS",
    "Barão do Triunfo": "BARAO DO TRIUNFO",
    "Bom Princípio": "BOM PRINCIPIO",
    Brochier: "BROCHIER",
    Butiá: "BUTIA",
    Cachoeirinha: "CACHOEIRINHA",
    "Campo Bom": "CAMPO BOM",
    Canela: "CANELA",
    Canoas: "CANOAS",
    "Capão da Canoa": "CAPAO DA CANOA",
    "Capela de Santana": "CAPELA DE SANTANA",
    Charqueadas: "CHARQUEADAS",
    "Dois Irmãos": "DOIS IRMAOS",
    "Eldorado do Sul": "ELDORADO DO SUL",
    Encantado: "ENCANTADO",
    Esteio: "ESTEIO",
    "Estância Velha": "ESTANCIA VELHA",
    Feliz: "FELIZ",
    "General Câmara": "GENERAL CAMARA",
    Glorinha: "GLORINHA",
    Gramado: "GRAMADO",
    Gravataí: "GRAVATAI",
    Guaíba: "GUAIBA",
    Igrejinha: "IGREJINHA",
    Ivoti: "IVOTI",
    Lajeado: "LAJEADO",
    Maratá: "MARATA",
    Montenegro: "MONTENEGRO",
    "Nova Hartz": "NOVA HARTZ",
    "Nova Petrópolis": "NOVA PETROPOLIS",
    "Nova Santa Rita": "NOVA SANTA RITA",
    "Novo Hamburgo": "NOVO HAMBURGO",
    Osório: "OSORIO",
    Parobé: "PAROBE",
    "Porto Alegre": "PORTO ALEGRE",
    Portão: "PORTAO",
    Rolante: "ROLANTE",
    "Santa Cruz do Sul": "SANTA CRUZ DO SUL",
    "Santo Antônio da Patrulha": "SANTO ANTONIO DA PATRULHA",
    Sapiranga: "SAPIRANGA",
    "Sapucaia do Sul": "SAPUCAIA DO SUL",
    "São Jerônimo": "SAO JERONIMO",
    "São Leopoldo": "SAO LEOPOLDO",
    "São Sebastião do Caí": "SAO SEBASTIAO DO CAI",
    Taquara: "TAQUARA",
    Tramandaí: "TRAMANDAI",
    Triunfo: "TRIUNFO",
    Tunas: "TUNAS",
    "Vale Real": "VALE REAL",
    Viamão: "VIAMAO"
  },
  PR: {
    Curitiba: "CURITIBA",
    "São José dos Pinhais": "SAO JOSE DOS PINHAIS",
    Pinhais: "PINHAIS",
    Colombo: "COLOMBO",
    Araucária: "ARAUCARIA",
    "Fazenda Rio Grande": "FAZENDA RIO GRANDE",
    "Campina Grande do Sul": "CAMPINA GRANDE DO SUL",
    "Almirante Tamandaré": "ALMIRANTE TAMANDARE",
    Piraquara: "PIRAQUARA",
    "Quatro Barras": "QUATRO BARRAS",
    "Campo Largo": "CAMPO LARGO",
    "Balsa Nova": "BALSA NOVA",
    Contenda: "CONTENDA",
    Mandirituba: "MANDIRITUBA",
    "Tijucas do Sul": "TIJUCAS DO SUL"
  }
};

export function listOfficialCitiesForUf(uf: string): string[] {
  const map = ANP_CITIES_BY_UF[uf.toUpperCase()];
  if (!map) return [];
  return Object.keys(map).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function resolveAnpMunicipioApiName(uf: string, officialOrApiName: string): string | null {
  const u = uf.toUpperCase();
  const map = ANP_CITIES_BY_UF[u];
  if (!map) return null;
  if (map[officialOrApiName]) return map[officialOrApiName];
  const upper = officialOrApiName.trim().toUpperCase();
  if (Object.values(map).includes(upper)) return upper;
  return null;
}
