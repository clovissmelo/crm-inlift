import { isStructuredCallScriptBody } from "@/lib/call-script-log";

export type MessageScriptPickRow = {
  body: string;
  script_type: string;
  product_id: number | null;
  updated_at?: string | null;
};

function scriptRecency(s: MessageScriptPickRow): number {
  if (!s.updated_at) return 0;
  const t = Date.parse(s.updated_at);
  return Number.isFinite(t) ? t : 0;
}

/** Escolhe o script de ligação mais adequado ao produto da chamada. */
export function pickCallScriptBody(items: MessageScriptPickRow[], productId: number | null): string | null {
  const callScripts = items.filter((s) => s.script_type === "call" && s.body?.trim());
  if (!callScripts.length) return null;

  const sortNewest = (list: MessageScriptPickRow[]) =>
    [...list].sort((a, b) => scriptRecency(b) - scriptRecency(a));

  if (productId != null) {
    const exact = sortNewest(callScripts.filter((s) => s.product_id === productId));
    const exactFlow = exact.find((s) => isStructuredCallScriptBody(s.body));
    if (exactFlow) return exactFlow.body;
    if (exact[0]) return exact[0].body;
  }

  const withFlow = sortNewest(callScripts.filter((s) => isStructuredCallScriptBody(s.body)));
  const genericFlow = withFlow.find((s) => s.product_id == null);
  if (genericFlow) return genericFlow.body;
  if (withFlow[0]) return withFlow[0].body;

  const pool = productId
    ? sortNewest(callScripts.filter((s) => s.product_id === productId || s.product_id == null))
    : sortNewest(callScripts);
  return pool[0]?.body ?? null;
}
