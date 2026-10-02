import { safeStr } from "@/lib/lead-motor/utils";

/** Remove sufixos societários comuns no final da razão social (nome fantasia derivado). */
export function stripCorporateLegalSuffix(name: string): string {
  let s = name.trim();
  if (!s) return s;
  const suffixes = [
    /\s+LTDA\.?\s*$/i,
    /\s+L\.?\s*T\.?\s*D\.?\s*A\.?\s*$/i,
    /\s+S\/A\.?\s*$/i,
    /\s+S\.?\s*A\.?\s*$/i
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of suffixes) {
      const next = s.replace(re, "").trim();
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }
  return s.trim();
}

function normalizeNameCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Nome fantasia para CRM: Receita quando existir e for distinto da razão;
 * senão razão social sem LTDA / S.A. / S/A / SA no final.
 */
export function resolveNomeFantasia(input: {
  receitaNomeFantasia?: string;
  razaoSocial?: string;
}): string {
  const razao = safeStr(input.razaoSocial);
  const receita = safeStr(input.receitaNomeFantasia);
  if (receita && normalizeNameCompare(receita) !== normalizeNameCompare(razao)) {
    return receita;
  }
  const stripped = stripCorporateLegalSuffix(razao);
  if (stripped) return stripped;
  return receita || razao;
}
