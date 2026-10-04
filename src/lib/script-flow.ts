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

export type ScriptFlowCaptureStep = {
  type: "capture";
  title: string;
  content: string;
  fields: ScriptFlowCaptureField[];
  next: string | null;
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
        fields: step.fields.map((f) => ({ ...f }))
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

/** IDs sequenciais (1…n) na ordem da lista — alinha sidebar, JSON e campo ID. */
export function normalizeDraftStepIds(drafts: ScriptFlowStepDraft[]): ScriptFlowStepDraft[] {
  if (drafts.length === 0) return drafts;
  const idMap = new Map<string, string>();
  drafts.forEach((d, i) => idMap.set(d.id, String(i + 1)));

  const mapNext = (next: string | null | undefined): string | null => {
    if (!next?.trim()) return null;
    return idMap.get(next) ?? null;
  };

  return drafts.map((d, i) => {
    const newId = String(i + 1);
    if (d.type === "branch") {
      return {
        ...d,
        id: newId,
        choices: (d.choices ?? []).map((c) => ({ ...c, next: mapNext(c.next) }))
      };
    }
    return { ...d, id: newId, next: mapNext(d.next) };
  });
}

export function normalizeCallScriptBodyForSave(body: string): string {
  const flow = parseCallScriptBody(body);
  if (!flow) return body;
  return serializeCallScriptFlow(draftsToFlow(normalizeDraftStepIds(flowToDrafts(flow))));
}

export function draftsToFlow(drafts: ScriptFlowStepDraft[]): ScriptFlow {
  const ordered = normalizeDraftStepIds(drafts);
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
          ...(c.contact_layer ? { contact_layer: c.contact_layer } : {})
        }))
      };
    } else if (d.type === "capture") {
      let next = d.next ?? null;
      if (!next && i < drafts.length - 1) {
        const followingId = drafts[i + 1]!.id.trim() || `step-${i + 2}`;
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
      steps[id] = {
        type: "capture",
        title: d.title.trim() || "Etapa",
        content: d.content,
        fields: fields.length > 0 ? fields : [...DEFAULT_CAPTURE_FIELDS],
        next
      };
    } else {
      let next = d.next ?? null;
      if (!next && i < drafts.length - 1) {
        const followingId = drafts[i + 1]!.id.trim() || `step-${i + 2}`;
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
