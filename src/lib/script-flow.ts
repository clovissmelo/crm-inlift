import type { TemplateVars } from "@/lib/message-templates";
import { applyTemplate } from "@/lib/message-templates";

export type ScriptFlowLinearStep = {
  type: "linear";
  title: string;
  content: string;
  next: string | null;
};

/** Preenche “Contato na ligação” no complemento quando o operador escolhe esta opção. */
export type ScriptFlowContactLayer = "decisor" | "outra" | "ninguem";

export type ScriptFlowBranchChoice = {
  label: string;
  next: string | null;
  contact_layer?: ScriptFlowContactLayer;
  /** Na ligação, pede data/hora antes de seguir (preenche reunião no registro). */
  schedule_meeting?: boolean;
};

export type ScriptFlowBranchStep = {
  type: "branch";
  title: string;
  content: string;
  question: string;
  choices: ScriptFlowBranchChoice[];
};

export type ScriptFlowCaptureField = {
  key: string;
  label: string;
  placeholder?: string;
  /** text (default), tel ou textarea */
  input?: "text" | "tel" | "textarea";
};

export type ScriptFlowCreateContactMode = "skip" | "create";

export type ScriptFlowCaptureStep = {
  type: "capture";
  title: string;
  content: string;
  fields: ScriptFlowCaptureField[];
  next: string | null;
  /** Ao salvar anotação na ligação, cadastra contato no cliente. */
  create_contact?: ScriptFlowCreateContactMode;
  /** Tag de perfil (ex.: PERFIL DECISOR) quando create_contact = create. */
  contact_profile_tag?: string;
};

export type ScriptFlowStep = ScriptFlowLinearStep | ScriptFlowBranchStep | ScriptFlowCaptureStep;

export type ScriptFlow = {
  v: 1;
  start: string;
  steps: Record<string, ScriptFlowStep>;
};

export type ScriptFlowStepDraft = {
  id: string;
  type: "linear" | "branch" | "capture";
  title: string;
  content: string;
  next?: string | null;
  question?: string;
  choices?: ScriptFlowBranchChoice[];
  fields?: ScriptFlowCaptureField[];
  create_contact?: ScriptFlowCreateContactMode;
  contact_profile_tag?: string;
};

export const DEFAULT_CAPTURE_FIELDS: ScriptFlowCaptureField[] = [
  { key: "nome", label: "Nome", placeholder: "Nome do contato / responsável" },
  { key: "cargo", label: "Função / cargo", placeholder: "Ex.: Gerente, Sócio" },
  { key: "telefone", label: "Telefone", placeholder: "(DDD) 9xxxx-xxxx", input: "tel" },
  { key: "observacao", label: "Observação", placeholder: "Retorno, horário, etc.", input: "textarea" }
];

/** Rótulo alinhado ao complemento de registro quando o campo usa chave nome/cargo. */
export function captureFieldRegistrationLabel(
  field: ScriptFlowCaptureField,
  contactLayer: "decisor" | "outra" | "ninguem" | null
): string {
  if (field.key === "nome") {
    if (contactLayer === "decisor") return "Nome do decisor *";
    if (contactLayer === "outra") return "Nome de quem atendeu *";
    return "Nome *";
  }
  if (field.key === "cargo") return "Função / cargo";
  return field.label;
}

function walkStepNext(step: ScriptFlowStep): string | null {
  if (step.type === "branch") return null;
  return step.next;
}

function walkStepBranches(step: ScriptFlowStep): Array<string | null> {
  if (step.type !== "branch") return [];
  return step.choices.map((c) => c.next);
}

export function isScriptFlow(value: unknown): value is ScriptFlow {
  if (!value || typeof value !== "object") return false;
  const o = value as ScriptFlow;
  return o.v === 1 && typeof o.start === "string" && o.steps != null && typeof o.steps === "object";
}

/** Converte body do banco em fluxo (JSON) ou texto legado em um passo único. */
export function parseCallScriptBody(body: string): ScriptFlow | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isScriptFlow(parsed) && parsed.steps[parsed.start]) return enrichLinearNextLinks(parsed);
  } catch {
    /* texto legado */
  }
  return {
    v: 1,
    start: "step-1",
    steps: {
      "step-1": {
        type: "linear",
        title: "Script",
        content: trimmed,
        next: null
      }
    }
  };
}

export function serializeCallScriptFlow(flow: ScriptFlow): string {
  return JSON.stringify(flow);
}

/** Preenche `next` em etapas lineares quando a ordem das etapas indica sequência. */
export function enrichLinearNextLinks(flow: ScriptFlow): ScriptFlow {
  return draftsToFlow(flowToDrafts(flow));
}

export function flowToDrafts(flow: ScriptFlow): ScriptFlowStepDraft[] {
  const order: string[] = [];
  const seen = new Set<string>();
  function walk(id: string | null) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    order.push(id);
    const step = flow.steps[id];
    if (!step) return;
    walk(walkStepNext(step));
    for (const n of walkStepBranches(step)) walk(n);
  }
  walk(flow.start);
  for (const id of Object.keys(flow.steps)) {
    if (!seen.has(id)) order.push(id);
  }
  return order.map((id) => {
    const step = flow.steps[id]!;
    if (step.type === "linear") {
      return { id, type: "linear", title: step.title, content: step.content, next: step.next };
    }
    if (step.type === "capture") {
      return {
        id,
        type: "capture",
        title: step.title,
        content: step.content,
        next: step.next,
        fields: step.fields.map((f) => ({ ...f })),
        ...(step.create_contact ? { create_contact: step.create_contact } : {}),
        ...(step.contact_profile_tag?.trim() ? { contact_profile_tag: step.contact_profile_tag.trim() } : {})
      };
    }
    return {
      id,
      type: "branch",
      title: step.title,
      content: step.content,
      question: step.question,
      choices: step.choices.map((c) => ({ ...c }))
    };
  });
}

/** Garante id interno único por etapa (não altera ordem nem links). */
export function ensureInternalStepIds(drafts: ScriptFlowStepDraft[]): ScriptFlowStepDraft[] {
  const used = new Set<string>();
  return drafts.map((d, i) => {
    let id = d.id.trim();
    if (!id) id = `_step${i + 1}`;
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    used.add(id);
    return id === d.id ? d : { ...d, id };
  });
}

export function normalizeCallScriptBodyForSave(body: string): string {
  const flow = parseCallScriptBody(body);
  if (!flow) return body;
  return serializeCallScriptFlow(draftsToFlow(ensureInternalStepIds(flowToDrafts(flow))));
}

export function draftsToFlow(drafts: ScriptFlowStepDraft[]): ScriptFlow {
  const ordered = ensureInternalStepIds(drafts);
  const steps: Record<string, ScriptFlowStep> = {};
  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i]!;
    const id = d.id.trim() || `step-${i + 1}`;
    if (d.type === "branch") {
      steps[id] = {
        type: "branch",
        title: d.title.trim() || "Etapa",
        content: d.content,
        question: d.question?.trim() || "Como seguir?",
        choices: (d.choices ?? []).filter((c) => c.label.trim()).map((c) => ({
          label: c.label.trim(),
          next: c.next,
          ...(c.contact_layer ? { contact_layer: c.contact_layer } : {}),
          ...(c.schedule_meeting ? { schedule_meeting: true } : {})
        }))
      };
    } else if (d.type === "capture") {
      let next = d.next ?? null;
      if (!next && i < ordered.length - 1) {
        const followingId = ordered[i + 1]!.id.trim() || `step-${i + 2}`;
        next = followingId;
      }
      const fields = (d.fields ?? DEFAULT_CAPTURE_FIELDS)
        .filter((f) => f.label.trim())
        .map((f, fi) => ({
          key: (f.key.trim() || `campo_${fi + 1}`).replace(/\s+/g, "_"),
          label: f.label.trim(),
          placeholder: f.placeholder?.trim() || undefined,
          input: f.input
        }));
      const createContact = d.create_contact === "create";
      steps[id] = {
        type: "capture",
        title: d.title.trim() || "Etapa",
        content: d.content,
        fields: fields.length > 0 ? fields : [...DEFAULT_CAPTURE_FIELDS],
        next,
        ...(createContact
          ? {
              create_contact: "create" as const,
              contact_profile_tag: (d.contact_profile_tag?.trim() || "PERFIL DECISOR").slice(0, 80)
            }
          : {})
      };
    } else {
      let next = d.next ?? null;
      if (!next && i < ordered.length - 1) {
        const followingId = ordered[i + 1]!.id.trim() || `step-${i + 2}`;
        next = followingId;
      }
      steps[id] = {
        type: "linear",
        title: d.title.trim() || "Etapa",
        content: d.content,
        next
      };
    }
  }
  const start = ordered[0]?.id.trim() || "step-1";
  return { v: 1, start: steps[start] ? start : Object.keys(steps)[0] ?? "step-1", steps };
}

export function renderStepContent(content: string, vars: TemplateVars) {
  return applyTemplate(content, vars);
}

export function branchChoiceContactLayer(
  step: ScriptFlowBranchStep,
  choiceLabel: string
): ScriptFlowContactLayer | undefined {
  const choice = step.choices.find((c) => c.label === choiceLabel);
  return choice?.contact_layer;
}

export function branchChoiceScheduleMeeting(step: ScriptFlowBranchStep, choiceLabel: string): boolean {
  const choice = step.choices.find((c) => c.label === choiceLabel);
  return choice?.schedule_meeting === true;
}

/** Modelo PostoCred — editável em Abordagens. */
export function defaultPostoCredCallFlow(): ScriptFlow {
  return {
    v: 1,
    start: "saudacao",
    steps: {
      saudacao: {
        type: "linear",
        title: "Etapa 1 — Saudação e apresentação",
        content: `Olá, {{contato_nome}}, tudo bem? Aqui é a {{produto_nome}} / Inlift.

Estou entrando em contato com a {{cliente_nome}} para apresentar soluções de crédito e gestão para postos — costuma ser rápido, uns 2 minutos.

Posso seguir?`,
        next: "decisor"
      },
      decisor: {
        type: "branch",
        title: "Etapa 2 — Decisor",
        content: "Preciso alinhar com quem decide sobre compra de combustível e condições comerciais no posto.",
        question: "Estou falando com o decisor de compra de combustível?",
        choices: [
          { label: "Sim, sou o decisor", next: "interesse_decisor", contact_layer: "decisor" },
          { label: "Não — outra pessoa decide", next: "nao_decisor", contact_layer: "outra" }
        ]
      },
      nao_decisor: {
        type: "capture",
        title: "Etapa 2b — Identificar decisor",
        content: `Entendi. Anote abaixo quem decide e o melhor contato. Confirme também se pode retornar e quando.`,
        fields: [
          { key: "nome", label: "Nome do responsável", placeholder: "Quem decide a compra" },
          { key: "cargo", label: "Função / cargo", placeholder: "Ex.: Sócio, Gerente" },
          { key: "telefone", label: "Telefone / WhatsApp", input: "tel" },
          { key: "retorno", label: "Melhor dia/horário para retorno", input: "textarea" }
        ],
        next: "encerramento_soft"
      },
      interesse_decisor: {
        type: "branch",
        title: "Etapa 3 — Interesse",
        content: `Hoje muitos postos usam o {{produto_nome}} para melhorar limite, prazo e previsibilidade no abastecimento da frota e do pista.

Vocês já trabalham com algum programa de crédito/consórcio para combustível?`,
        question: "Demonstrou interesse em conhecer a solução?",
        choices: [
          { label: "Sim, quer conversar", next: "agendamento" },
          { label: "Não / sem interesse agora", next: "objecao" }
        ]
      },
      agendamento: {
        type: "linear",
        title: "Etapa 4 — Agendamento",
        content: `Ótimo! Vou agendar uma conversa de 15–20 minutos com nosso especialista.

Qual dia e horário funciona melhor? Confirme e-mail ou WhatsApp para enviar o convite.`,
        next: null
      },
      objecao: {
        type: "linear",
        title: "Etapa 4 — Objeção / retorno",
        content: `Sem problema. Posso enviar um material resumido por WhatsApp/e-mail?

Se preferir, retorno em outro momento — qual período costuma ser melhor?`,
        next: "encerramento_soft"
      },
      encerramento_soft: {
        type: "linear",
        title: "Encerramento",
        content: "Agradeço o tempo! Registro o retorno e qualquer dúvida estamos à disposição. Tenha um ótimo dia!",
        next: null
      }
    }
  };
}

export function defaultEmptyCallFlow(): ScriptFlow {
  return {
    v: 1,
    start: "1",
    steps: {
      "1": {
        type: "linear",
        title: "Etapa 1 — Saudação",
        content: "Olá, {{contato_nome}}, aqui é da {{produto_nome}}...",
        next: null
      }
    }
  };
}
