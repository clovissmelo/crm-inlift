import type { TemplateVars } from "@/lib/message-templates";
import { applyTemplate } from "@/lib/message-templates";

export type ScriptFlowLinearStep = {
  type: "linear";
  title: string;
  content: string;
  next: string | null;
};

export type ScriptFlowBranchStep = {
  type: "branch";
  title: string;
  content: string;
  question: string;
  choices: Array<{ label: string; next: string | null }>;
};

export type ScriptFlowStep = ScriptFlowLinearStep | ScriptFlowBranchStep;

export type ScriptFlow = {
  v: 1;
  start: string;
  steps: Record<string, ScriptFlowStep>;
};

export type ScriptFlowStepDraft = {
  id: string;
  type: "linear" | "branch";
  title: string;
  content: string;
  next?: string | null;
  question?: string;
  choices?: Array<{ label: string; next: string | null }>;
};

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
    if (step.type === "linear") walk(step.next);
    else for (const c of step.choices) walk(c.next);
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

export function draftsToFlow(drafts: ScriptFlowStepDraft[]): ScriptFlow {
  const steps: Record<string, ScriptFlowStep> = {};
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    const id = d.id.trim() || `step-${i + 1}`;
    if (d.type === "branch") {
      steps[id] = {
        type: "branch",
        title: d.title.trim() || "Etapa",
        content: d.content,
        question: d.question?.trim() || "Como seguir?",
        choices: (d.choices ?? []).filter((c) => c.label.trim()).map((c) => ({
          label: c.label.trim(),
          next: c.next
        }))
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
  const start = drafts[0]?.id.trim() || "step-1";
  return { v: 1, start: steps[start] ? start : Object.keys(steps)[0] ?? "step-1", steps };
}

export function renderStepContent(content: string, vars: TemplateVars) {
  return applyTemplate(content, vars);
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
          { label: "Sim, sou o decisor", next: "interesse_decisor" },
          { label: "Não — outra pessoa decide", next: "nao_decisor" }
        ]
      },
      nao_decisor: {
        type: "linear",
        title: "Etapa 2b — Identificar decisor",
        content: `Entendi. Qual o nome e o melhor contato (telefone ou WhatsApp) do responsável pela compra de combustível?

Posso retornar no horário que for melhor para ele(a)? Anote o retorno e confirme data/hora.`,
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
