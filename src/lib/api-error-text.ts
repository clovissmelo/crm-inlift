/** Converte corpo de erro de API (string, objeto, Zod) em texto para o usuário. */
export function apiErrorText(payload: unknown, fallback = "Ocorreu um erro."): string {
  if (payload == null) return fallback;
  if (typeof payload === "string") return payload.trim() || fallback;

  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
    if (obj.error != null && typeof obj.error === "object") {
      const nested = apiErrorText(obj.error, "");
      if (nested) return nested;
    }
    if (Array.isArray(obj.issues) && obj.issues.length > 0) {
      const first = obj.issues[0] as { message?: string } | undefined;
      if (first?.message) return first.message;
    }
    try {
      const s = JSON.stringify(payload);
      if (s && s !== "{}") return s.length > 200 ? `${s.slice(0, 200)}…` : s;
    } catch {
      /* ignore */
    }
  }

  return fallback;
}

/** Mensagens da API4COM traduzidas para orientação no CRM. */
export function humanizeApi4comDialError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("user not registered")) {
    return (
      "A API4COM não reconheceu o ramal com o token atual. " +
      "O token (perfil ou Admin → Variáveis) precisa ser da mesma conta em que o ramal existe (Integrações → Ramal, ex.: 1000). " +
      "Confira se o ramal está ativo e com usuário/e-mail cadastrados no painel API4COM."
    );
  }
  if (m.includes("invalid extension") || m.includes("extension")) {
    return `Ramal recusado pela API4COM: ${message}. Confira o número cadastrado no CRM e no painel (Integrações → Ramal).`;
  }
  return message;
}
