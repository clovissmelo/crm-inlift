import { BRASIL_API_CNPJ } from "@/lib/lead-motor/motor-config";
import type { AnpStation } from "@/lib/lead-motor/anp";
import { resolveNomeFantasia } from "@/lib/lead-motor/trade-name";
import { normalizePhoneDigits, safeStr } from "@/lib/lead-motor/utils";

export type PhoneCandidate = {
  digits: string;
  origin: string;
  contact_name: string | null;
};

/** Sócio pessoa física (CPF) da QSA Receita / Brasil API. */
export type SocioPessoaFisica = {
  name: string;
};

export type EnrichmentResult = {
  nome_fantasia: string;
  email: string;
  website: string;
  /** Primeiro sócio PF (compatível com fluxos que usam um nome padrão em telefones). */
  socio_principal: string;
  socios_pessoa_fisica: SocioPessoaFisica[];
  phones: PhoneCandidate[];
  sources: string[];
};

const SOCIO_PF_IDENTIFICADOR = 2;

function normalizeContactNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** identificador_de_socio: 1 = PJ, 2 = PF, 3 = estrangeiro (Brasil API / Receita). */
export function isQsaSocioPessoaFisica(item: Record<string, unknown>): boolean {
  const id = item.identificador_de_socio;
  if (id === SOCIO_PF_IDENTIFICADOR || id === "2") return true;
  if (id === 1 || id === "1" || id === 3 || id === "3") return false;
  const doc = safeStr(item.cnpj_cpf_do_socio ?? item.cpf_cnpj_socio);
  if (!doc) return false;
  if (doc.includes("*")) {
    const digits = doc.replace(/\D/g, "");
    return digits.length <= 11;
  }
  const digits = doc.replace(/\D/g, "");
  return digits.length > 0 && digits.length <= 11;
}

export function parseSociosPessoaFisicaFromQsa(qsa: unknown): SocioPessoaFisica[] {
  if (!Array.isArray(qsa)) return [];
  const out: SocioPessoaFisica[] = [];
  const seen = new Set<string>();
  for (const raw of qsa) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (!isQsaSocioPessoaFisica(item)) continue;
    const name = safeStr(item.nome_socio);
    if (!name) continue;
    const key = normalizeContactNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name });
  }
  return out;
}

export async function enrichFromReceita(cnpj: string, simulation: boolean): Promise<Partial<EnrichmentResult>> {
  if (simulation) return {};
  const url = BRASIL_API_CNPJ.replace("{cnpj}", cnpj);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, unknown>;
    const phones: PhoneCandidate[] = [];
    for (const idx of [1, 2]) {
      const combined = safeStr(data[`ddd_telefone_${idx}`]);
      const ddd = safeStr(data[`ddd_${idx}`] ?? data[`ddd`]);
      const tel = safeStr(data[`telefone_${idx}`] ?? data[`telefone`]);
      const raw = combined || `${ddd}${tel}`;
      const digits = normalizePhoneDigits(raw);
      if (digits) phones.push({ digits, origin: "Receita Federal", contact_name: null });
    }
    const sociosPf = parseSociosPessoaFisicaFromQsa(data.qsa);
    return {
      nome_fantasia: safeStr(data.nome_fantasia),
      email: safeStr(data.email),
      website: "",
      socio_principal: sociosPf[0]?.name ?? "",
      socios_pessoa_fisica: sociosPf,
      phones,
      sources: ["Receita Federal"]
    };
  } catch {
    return {};
  }
}

export function mergeEnrichment(
  station: AnpStation,
  receita: Partial<EnrichmentResult>,
  google: { phone_digits: string; phone_display: string; website: string; place_id: string } | null
): EnrichmentResult {
  const phones: PhoneCandidate[] = [];
  const sources = new Set<string>(["Dados da ANP"]);

  for (const p of receita.phones ?? []) {
    phones.push(p);
    sources.add("Receita Federal");
  }
  if (google?.phone_digits) {
    phones.push({
      digits: google.phone_digits,
      origin: "Google Places",
      contact_name: null
    });
    sources.add("Google Places");
  }

  const seen = new Set<string>();
  const uniquePhones = phones.filter((p) => {
    if (seen.has(p.digits)) return false;
    seen.add(p.digits);
    return true;
  });

  return {
    nome_fantasia: resolveNomeFantasia({
      receitaNomeFantasia: receita.nome_fantasia,
      razaoSocial: station.razao_social
    }),
    email: receita.email ?? "",
    website: google?.website || receita.website || "",
    socio_principal: receita.socio_principal ?? receita.socios_pessoa_fisica?.[0]?.name ?? "",
    socios_pessoa_fisica: receita.socios_pessoa_fisica ?? [],
    phones: uniquePhones,
    sources: [...sources]
  };
}
