export type CallScriptCaptureNote = { label: string; value: string; field_key?: string };

const SCRIPT_PERSON_NAME_KEYS = new Set(["nome", "name", "contacted_person_name"]);
const SCRIPT_PERSON_JOB_KEYS = new Set(["cargo", "funcao", "job_title", "funcao_cargo"]);

/** Nome e cargo capturados no roteiro (chaves nome/cargo ou rótulos compatíveis). */
export function personFromScriptLog(log: CallScriptLogEntry[]): { name: string; jobTitle: string } {
  let name = "";
  let jobTitle = "";
  for (const e of log) {
    if (e.action !== "capture" || !e.capture_notes?.length) continue;
    for (const n of e.capture_notes) {
      const val = n.value.trim();
      if (!val) continue;
      const key = (n.field_key ?? "").trim().toLowerCase();
      if (SCRIPT_PERSON_NAME_KEYS.has(key) || (!key && /nome/i.test(n.label))) {
        name = val;
      }
      if (
        SCRIPT_PERSON_JOB_KEYS.has(key) ||
        (!key && /cargo|função|funcao/i.test(n.label))
      ) {
        jobTitle = val;
      }
    }
  }
  return { name, jobTitle };
}

export type CallScriptLogEntry = {
  at: string;
  step_id: string;
  step_title: string;
  action: "next" | "choice" | "restart" | "capture";
  choice_label?: string | null;
  next_step_id?: string | null;
  capture_notes?: CallScriptCaptureNote[];
  /** Copiado da opção do roteiro — preenche contato no complemento. */
  contact_layer?: "decisor" | "outra" | "ninguem";
  /** Reunião agendada na etapa do roteiro (ISO UTC). */
  scheduled_meeting_at?: string | null;
  /** Retorno agendado na etapa do roteiro (ISO UTC). */
  scheduled_return_at?: string | null;
  /** Contato criado/atualizado no cliente ao salvar esta anotação. */
  created_contact_id?: number;
};

/** Última escolha do roteiro que define contato na ligação (Decisor / Outra / Ninguém). */
export function meetingScheduleFromScriptLog(log: CallScriptLogEntry[]): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const at = log[i]!.scheduled_meeting_at?.trim();
    if (at) return at;
  }
  return null;
}

export function returnScheduleFromScriptLog(log: CallScriptLogEntry[]): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const at = log[i]!.scheduled_return_at?.trim();
    if (at) return at;
  }
  return null;
}

export function contactLayerFromScriptLog(log: CallScriptLogEntry[]): "decisor" | "outra" | "ninguem" | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.action === "choice" && e.contact_layer) return e.contact_layer;
  }
  return null;
}

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
      ...choices.map((e) => {
        const title = (e.step_title || e.step_id).trim();
        const label = e.choice_label!.trim();
        return e.scheduled_meeting_at?.trim()
          ? `${title}: ${label} (reunião agendada)`
          : `${title}: ${label}`;
      })
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
    if (e.action === "choice" && e.choice_label) {
      const meet = e.scheduled_meeting_at?.trim();
      return meet ? `${title}: ${e.choice_label} (reunião ${meet})` : `${title}: ${e.choice_label}`;
    }
    if (e.action === "capture") {
      const block = formatCaptureNotes(e.capture_notes);
      return block ? `${title}: ${block}` : `${title} (anotações)`;
    }
    if (e.action === "next") {
      const meet = e.scheduled_meeting_at?.trim();
      const ret = e.scheduled_return_at?.trim();
      if (meet && ret) return `${title} → Próximo (reunião e retorno)`;
      if (meet) return `${title} → Próximo (reunião agendada)`;
      if (ret) return `${title} → Próximo (retorno agendado)`;
      return `${title} → Próximo`;
    }
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
      const meet = e.scheduled_meeting_at?.trim();
      return meet
        ? `· ${title}: ${e.choice_label} — reunião agendada`
        : `· ${title}: ${e.choice_label}`;
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
    return p.v === 2 || p.v === 1;
  } catch {
    return false;
  }
}
