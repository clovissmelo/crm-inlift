export type CallScriptCaptureNote = { label: string; value: string };

export type CallScriptLogEntry = {
  at: string;
  step_id: string;
  step_title: string;
  action: "next" | "choice" | "restart" | "capture";
  choice_label?: string | null;
  next_step_id?: string | null;
  capture_notes?: CallScriptCaptureNote[];
};

export function normalizeCallScriptLog(raw: unknown): CallScriptLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is CallScriptLogEntry => {
    if (!e || typeof e !== "object") return false;
    const o = e as CallScriptLogEntry;
    return typeof o.step_id === "string" && typeof o.action === "string";
  });
}

function formatCaptureNotes(notes: CallScriptCaptureNote[] | undefined): string | null {
  if (!notes?.length) return null;
  const parts = notes.filter((n) => n.value.trim()).map((n) => `${n.label}: ${n.value.trim()}`);
  return parts.length ? parts.join("; ") : null;
}

/** Respostas do roteiro (prioriza escolhas em ramificações). */
export function formatCallScriptLogAnswers(log: CallScriptLogEntry[]): string | null {
  if (!log.length) return null;
  const choices = log.filter((e) => e.action === "choice" && e.choice_label?.trim());
  const captures = log.filter((e) => e.action === "capture");
  const parts: string[] = [];
  if (choices.length > 0) {
    parts.push(
      ...choices.map((e) => `${(e.step_title || e.step_id).trim()}: ${e.choice_label!.trim()}`)
    );
  }
  for (const e of captures) {
    const block = formatCaptureNotes(e.capture_notes);
    if (block) parts.push(`${(e.step_title || e.step_id).trim()} — ${block}`);
  }
  if (parts.length) return parts.join(" · ");
  return formatCallScriptLogInline(log);
}

/** Bloco "Roteiro da ligação" salvo em observações da abordagem. */
export function stripScriptBlockFromApproachNotes(notes: string | null | undefined): string | null {
  if (!notes?.includes("Roteiro da ligação")) return notes?.trim() || null;
  const idx = notes.indexOf("Roteiro da ligação");
  const before = notes.slice(0, idx).trim();
  const tail = notes.slice(idx);
  const blankBreak = tail.search(/\n\n/);
  const after = blankBreak >= 0 ? tail.slice(blankBreak + 2).trim() : "";
  return [before, after].filter(Boolean).join("\n\n") || null;
}

export function extractScriptSummaryFromApproachNotes(notes: string | null | undefined): string | null {
  if (!notes?.includes("Roteiro da ligação")) return null;
  const idx = notes.indexOf("Roteiro da ligação");
  const tail = notes.slice(idx);
  const blankBreak = tail.search(/\n\n/);
  const block = blankBreak >= 0 ? tail.slice(0, blankBreak) : tail;
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*·\s*/, "").trim())
    .filter(Boolean);
  if (lines.length <= 1) return null;
  const body = lines.slice(1).join(" · ");
  return body ? `Roteiro: ${body}` : null;
}

/** Uma linha para timeline / listas (separador ·). */
export function formatCallScriptLogInline(log: CallScriptLogEntry[]): string | null {
  if (!log.length) return null;
  const parts = log.map((e) => {
    const title = e.step_title?.trim() || e.step_id;
    if (e.action === "choice" && e.choice_label) return `${title}: ${e.choice_label}`;
    if (e.action === "capture") {
      const block = formatCaptureNotes(e.capture_notes);
      return block ? `${title}: ${block}` : `${title} (anotações)`;
    }
    if (e.action === "next") return `${title} → Próximo`;
    if (e.action === "restart") return "Reinício do roteiro";
    return title;
  });
  return `Roteiro: ${parts.join(" · ")}`;
}

export function formatCallScriptLogForNotes(log: CallScriptLogEntry[]): string | null {
  if (!log.length) return null;
  const lines = log.map((e) => {
    const title = e.step_title?.trim() || e.step_id;
    if (e.action === "choice" && e.choice_label) {
      return `· ${title}: ${e.choice_label}`;
    }
    if (e.action === "capture") {
      const block = formatCaptureNotes(e.capture_notes);
      return block ? `· ${title}: ${block}` : `· ${title} (sem anotação)`;
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
