export type TemplateVars = {
  contato_nome?: string | null;
  cliente_nome?: string | null;
  produto_nome?: string | null;
};

const PLACEHOLDER_RE = /\{\{(contato_nome|cliente_nome|produto_nome)\}\}/g;

export function findMissingTemplateVars(body: string, vars: TemplateVars) {
  const missing = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const key = match[1] as keyof TemplateVars;
    const val = vars[key];
    if (!val || !String(val).trim()) missing.add(key);
  }
  return [...missing];
}

export function applyTemplate(body: string, vars: TemplateVars) {
  return body.replace(PLACEHOLDER_RE, (_, key: keyof TemplateVars) => {
    const val = vars[key];
    return val && String(val).trim() ? String(val).trim() : "";
  });
}

export const PLACEHOLDER_HELP = [
  { key: "{{contato_nome}}", label: "Nome do contato" },
  { key: "{{cliente_nome}}", label: "Nome do cliente" },
  { key: "{{produto_nome}}", label: "Nome do produto" }
] as const;
