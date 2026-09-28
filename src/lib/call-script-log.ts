export type CallScriptLogEntry = {
  at: string;
  step_id: string;
  step_title: string;
  action: "next" | "choice" | "restart";
  choice_label?: string | null;
  next_step_id?: string | null;
};

export function normalizeCallScriptLog(raw: unknown): CallScriptLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is CallScriptLogEntry => {
    if (!e || typeof e !== "object") return false;
    const o = e as CallScriptLogEntry;
    return typeof o.step_id === "string" && typeof o.action === "string";
  });
}

export function formatCallScriptLogForNotes(log: CallScriptLogEntry[]): string | null {
  if (!log.length) return null;
  const lines = log.map((e) => {
    const title = e.step_title?.trim() || e.step_id;
    if (e.action === "choice" && e.choice_label) {
      return `· ${title}: ${e.choice_label}`;
    }
    if (e.action === "next") {
      return `· ${title} → Próximo`;
    }
    if (e.action === "restart") {
      return `· Reinício do roteiro`;
    }
    return `· ${title}`;
  });
  return ["Roteiro da ligação:", ...lines].join("\n");
}

export function isStructuredCallScriptBody(body: string): boolean {
  try {
    const p = JSON.parse(body.trim()) as { v?: number };
    return p.v === 1;
  } catch {
    return false;
  }
}
