import { BRASIL_API_CNPJ } from "@/lib/lead-motor/motor-config";
import type { AnpStation } from "@/lib/lead-motor/anp";
import { normalizePhoneDigits, safeStr } from "@/lib/lead-motor/utils";

export type PhoneCandidate = {
  digits: string;
  origin: string;
  contact_name: string | null;
};

export type EnrichmentResult = {
  nome_fantasia: string;
  email: string;
  website: string;
  socio_principal: string;
  phones: PhoneCandidate[];
  sources: string[];
};

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
    const socios: string[] = [];
    const qsa = data.qsa;
    if (Array.isArray(qsa)) {
      for (const item of qsa) {
        if (item && typeof item === "object") {
          const nome = safeStr((item as Record<string, unknown>).nome_socio);
          if (nome) socios.push(nome);
        }
      }
    }
    return {
      nome_fantasia: safeStr(data.nome_fantasia),
      email: safeStr(data.email),
      website: "",
      socio_principal: socios[0] ?? "",
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
    nome_fantasia: receita.nome_fantasia || station.nome_fantasia,
    email: receita.email ?? "",
    website: google?.website || receita.website || "",
    socio_principal: receita.socio_principal ?? "",
    phones: uniquePhones,
    sources: [...sources]
  };
}
