import type { CallScriptCaptureNote } from "@/lib/call-script-log";
import type { ScriptFlowStep } from "@/lib/script-flow";

const NAME_KEYS = new Set(["nome", "name", "contacted_person_name"]);
const PHONE_KEYS = new Set(["telefone", "phone", "whatsapp", "tel", "celular"]);
const JOB_KEYS = new Set(["cargo", "funcao", "job_title", "funcao_cargo"]);

export function parseContactProfileTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      return [raw.trim()];
    }
  }
  return [];
}

export function mergeProfileTags(existing: string[], add: string): string[] {
  const tag = add.trim();
  if (!tag) return existing;
  const set = new Set(existing.map((t) => t.trim()).filter(Boolean));
  set.add(tag);
  return [...set];
}

export function contactPayloadFromCaptureNotes(notes: CallScriptCaptureNote[]): {
  name: string;
  phone: string | null;
  jobTitle: string | null;
  extraNotes: string | null;
} | null {
  let name = "";
  let phone: string | null = null;
  let jobTitle: string | null = null;
  const extras: string[] = [];

  for (const n of notes) {
    const val = n.value.trim();
    if (!val) continue;
    const key = (n.field_key ?? "").trim().toLowerCase();
    if (NAME_KEYS.has(key) || (!key && /nome/i.test(n.label))) {
      name = val;
      continue;
    }
    if (PHONE_KEYS.has(key) || (!key && /telefone|whatsapp|celular/i.test(n.label))) {
      phone = val;
      continue;
    }
    if (JOB_KEYS.has(key) || (!key && /cargo|função|funcao/i.test(n.label))) {
      jobTitle = val;
      continue;
    }
    extras.push(`${n.label}: ${val}`);
  }

  if (!name.trim()) return null;
  return {
    name: name.trim(),
    phone,
    jobTitle,
    extraNotes: extras.length ? extras.join("\n") : null
  };
}

export function captureStepCreatesContact(step: ScriptFlowStep | null | undefined): boolean {
  return step?.type === "capture" && step.create_contact === "create";
}

export function captureStepContactTag(step: ScriptFlowStep | null | undefined): string | null {
  if (!captureStepCreatesContact(step)) return null;
  if (step?.type !== "capture") return null;
  return step.contact_profile_tag?.trim() || "PERFIL DECISOR";
}
