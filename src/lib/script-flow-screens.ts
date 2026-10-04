import type { TemplateVars } from "@/lib/message-templates";
import { applyTemplate } from "@/lib/message-templates";

/** Preenche “Contato na ligação” no complemento quando o operador escolhe esta opção. */
export type ScriptFlowContactLayer = "decisor" | "outra" | "ninguem";

export type ScriptFlowBranchChoice = {
  label: string;
  next: string | null;
  contact_layer?: ScriptFlowContactLayer;
  schedule_meeting?: boolean;
};

export type ScriptFlowCaptureField = {
  key: string;
  label: string;
  placeholder?: string;
  input?: "text" | "tel" | "textarea";
};

export type ScriptTextBlock = { id: string; kind: "text"; content: string };
export type ScriptNotesBlock = { id: string; kind: "notes"; fields: ScriptFlowCaptureField[] };
export type ScriptContactRegisterBlock = {
  id: string;
  kind: "contact_register";
  /** Metadado ao gravar contato no cliente (ex.: PERFIL DECISOR). */
  contact_profile_tag?: string;
  fields?: ScriptFlowCaptureField[];
};
export type ScriptScheduleMeetingBlock = {
  id: string;
  kind: "schedule_meeting";
  prompt?: string;
};

export type ScriptScheduleReturnBlock = {
  id: string;
  kind: "schedule_return";
  prompt?: string;
};

export type ScriptScreenBlock =
  | ScriptTextBlock
  | ScriptNotesBlock
  | ScriptContactRegisterBlock
  | ScriptScheduleMeetingBlock
  | ScriptScheduleReturnBlock;

export type ScriptScreenNavigation =
  | {
      mode: "sequential";
      next: string | null;
      /** true = “Fim do fluxo” (não segue ordem das telas) */
      nextIsEnd?: boolean;
      /** BDR pode avançar sem preencher campos desta tela. */
      allow_skip?: boolean;
    }
  | { mode: "branch"; question: string; choices: ScriptFlowBranchChoice[] };

export type ScriptScreen = {
  title: string;
  blocks: ScriptScreenBlock[];
  navigation: ScriptScreenNavigation;
};

export type ScriptCallFlow = {
  v: 2;
  start: string;
  /** Ordem das telas no editor (ids). */
  screenOrder?: string[];
  screens: Record<string, ScriptScreen>;
};

export type ScriptScreenDraft = {
  id: string;
  title: string;
  blocks: ScriptScreenBlock[];
  navigation: ScriptScreenNavigation;
};

export const DEFAULT_CAPTURE_FIELDS: ScriptFlowCaptureField[] = [
  { key: "nome", label: "Nome", placeholder: "Nome do contato / responsável" },
  { key: "cargo", label: "Função / cargo", placeholder: "Ex.: Gerente, Sócio" },
  { key: "telefone", label: "Telefone", placeholder: "(DDD) 9xxxx-xxxx", input: "tel" },
  { key: "observacao", label: "Observação", placeholder: "Retorno, horário, etc.", input: "textarea" }
];

export const DEFAULT_CONTACT_REGISTER_FIELDS: ScriptFlowCaptureField[] = [
  { key: "nome", label: "Nome", placeholder: "Nome completo do contato" },
  { key: "cargo", label: "Cargo / função", placeholder: "Ex.: Sócio, Gerente de compras" },
  { key: "telefone", label: "Telefone", placeholder: "(DDD) 9xxxx-xxxx", input: "tel" }
];

const CONTACT_REGISTER_KEYS = ["nome", "cargo", "telefone"] as const;

export function contactRegisterFields(block: ScriptContactRegisterBlock): ScriptFlowCaptureField[] {
  const raw = block.fields?.length ? block.fields : DEFAULT_CONTACT_REGISTER_FIELDS;
  return CONTACT_REGISTER_KEYS.map((key, i) => {
    const fromBlock = raw.find((f) => f.key === key);
    const fallback = DEFAULT_CONTACT_REGISTER_FIELDS[i]!;
    return {
      key,
      label: (fromBlock?.label ?? fallback.label).trim() || fallback.label,
      placeholder: fromBlock?.placeholder?.trim() || fallback.placeholder,
      input: key === "telefone" ? "tel" : "text"
    };
  });
}

export function screenHasContactRegisterBlock(screen: ScriptScreen): boolean {
  return screen.blocks.some((b) => b.kind === "contact_register");
}

export function inputFieldsOnScreen(screen: ScriptScreen): ScriptFlowCaptureField[] {
  const out: ScriptFlowCaptureField[] = [];
  for (const b of screen.blocks) {
    if (b.kind === "notes") out.push(...b.fields);
    if (b.kind === "contact_register") out.push(...contactRegisterFields(b));
  }
  return out;
}

export function screenHasFillableFields(screen: ScriptScreen): boolean {
  return screenHasNotesBlock(screen) || screenHasContactRegisterBlock(screen);
}

export function screenAllowsSkip(screen: ScriptScreen): boolean {
  return screen.navigation.mode === "sequential" && Boolean(screen.navigation.allow_skip);
}

export const SCRIPT_BLOCK_LABELS: Record<ScriptScreenBlock["kind"], string> = {
  text: "Texto (descrições e instruções)",
  notes: "Anotações (observações para registro)",
  contact_register: "Registro de contato (cadastro no cliente)",
  schedule_meeting: "Agendar reunião",
  schedule_return: "Agendar retorno"
};

export function captureFieldRegistrationLabel(
  field: ScriptFlowCaptureField,
  contactLayer: ScriptFlowContactLayer | null
): string {
  if (field.key === "nome") {
    if (contactLayer === "decisor") return "Nome do decisor *";
    if (contactLayer === "outra") return "Nome de quem atendeu *";
    return "Nome *";
  }
  if (field.key === "cargo") return "Função / cargo";
  return field.label;
}

export function renderStepContent(content: string, vars: TemplateVars) {
  return applyTemplate(content, vars);
}

export function notesFieldsOnScreen(screen: ScriptScreen): ScriptFlowCaptureField[] {
  const block = screen.blocks.find((b): b is ScriptNotesBlock => b.kind === "notes");
  return block?.fields ?? [];
}

export function screenHasNotesBlock(screen: ScriptScreen): boolean {
  return screen.blocks.some((b) => b.kind === "notes");
}

export function screenHasScheduleBlock(screen: ScriptScreen): boolean {
  return screen.blocks.some((b) => b.kind === "schedule_meeting");
}

export function screenHasScheduleReturnBlock(screen: ScriptScreen): boolean {
  return screen.blocks.some((b) => b.kind === "schedule_return");
}

export function screenRequiresScheduleInput(screen: ScriptScreen): boolean {
  return screenHasScheduleBlock(screen) || screenHasScheduleReturnBlock(screen);
}

export function screenCreatesContact(screen: ScriptScreen): boolean {
  return screen.blocks.some((b) => b.kind === "contact_register");
}

export function screenContactTag(screen: ScriptScreen): string | null {
  const b = screen.blocks.find((x): x is ScriptContactRegisterBlock => x.kind === "contact_register");
  if (!b) return null;
  return b.contact_profile_tag?.trim() || "PERFIL DECISOR";
}

export function flowScreenOrder(flow: ScriptCallFlow): string[] {
  if (flow.screenOrder?.length) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of flow.screenOrder) {
      if (flow.screens[id] && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    for (const id of Object.keys(flow.screens)) {
      if (!seen.has(id)) out.push(id);
    }
    return out;
  }
  const order: string[] = [];
  const seen = new Set<string>();
  function walk(id: string | null) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    order.push(id);
    const screen = flow.screens[id];
    if (!screen) return;
    walk(walkScreenNext(screen));
    for (const n of walkScreenBranches(screen)) walk(n);
  }
  walk(flow.start);
  for (const id of Object.keys(flow.screens)) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

export function sequentialNext(flow: ScriptCallFlow, screenId: string): string | null {
  const screen = flow.screens[screenId];
  if (!screen || screen.navigation.mode !== "sequential") return null;
  const nav = screen.navigation;
  if (nav.nextIsEnd === true) return null;
  if (nav.next) return nav.next;
  const order = flowScreenOrder(flow);
  const i = order.indexOf(screenId);
  if (i >= 0 && i < order.length - 1) return order[i + 1]!;
  return null;
}

export function branchChoiceContactLayer(screen: ScriptScreen, choiceLabel: string): ScriptFlowContactLayer | undefined {
  if (screen.navigation.mode !== "branch") return undefined;
  const choice = screen.navigation.choices.find((c) => c.label === choiceLabel);
  return choice?.contact_layer;
}

export function branchChoiceScheduleMeeting(screen: ScriptScreen, choiceLabel: string): boolean {
  if (screen.navigation.mode !== "branch") return false;
  const choice = screen.navigation.choices.find((c) => c.label === choiceLabel);
  return choice?.schedule_meeting === true;
}

function newBlockId(kind: string) {
  return `blk_${kind}_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultEmptyCallFlow(): ScriptCallFlow {
  const id = "scr_1";
  return {
    v: 2,
    start: id,
    screens: {
      [id]: {
        title: "Tela 1 — Apresentação",
        blocks: [{ id: newBlockId("text"), kind: "text", content: "Olá, {{contato_nome}}, aqui é da {{produto_nome}}…" }],
        navigation: { mode: "sequential", next: null }
      }
    }
  };
}

export function defaultPostoCredCallFlow(): ScriptCallFlow {
  const saudacao = "scr_saudacao";
  const decisor = "scr_decisor";
  const naoDecisor = "scr_nao_decisor";
  const interesse = "scr_interesse";
  const agendamento = "scr_agendamento";
  const objecao = "scr_objecao";
  const encerramento = "scr_encerramento";
  return {
    v: 2,
    start: saudacao,
    screens: {
      [saudacao]: {
        title: "Apresentação",
        blocks: [
          {
            id: newBlockId("text"),
            kind: "text",
            content: `Olá, {{contato_nome}}, tudo bem? Aqui é da {{produto_nome}} / Inlift.

Estou entrando em contato com a {{cliente_nome}} para apresentar soluções de crédito e gestão para postos — costuma ser rápido, uns 2 minutos.

Posso seguir?`
          }
        ],
        navigation: { mode: "sequential", next: decisor }
      },
      [decisor]: {
        title: "Responsável pela compra",
        blocks: [
          {
            id: newBlockId("text"),
            kind: "text",
            content: "Preciso alinhar com quem decide sobre compra de combustível e condições comerciais no posto."
          }
        ],
        navigation: {
          mode: "branch",
          question: "Estou falando com o decisor de compra de combustível?",
          choices: [
            { label: "Sim, sou o decisor", next: interesse, contact_layer: "decisor" },
            { label: "Não — outra pessoa decide", next: naoDecisor, contact_layer: "outra" }
          ]
        }
      },
      [naoDecisor]: {
        title: "Identificar decisor",
        blocks: [
          {
            id: newBlockId("text"),
            kind: "text",
            content: "Anote quem decide e o melhor contato. Confirme também se pode retornar e quando."
          },
          {
            id: newBlockId("notes"),
            kind: "notes",
            fields: [
              { key: "nome", label: "Nome do responsável", placeholder: "Quem decide a compra" },
              { key: "cargo", label: "Função / cargo", placeholder: "Ex.: Sócio, Gerente" },
              { key: "telefone", label: "Telefone / WhatsApp", input: "tel" },
              { key: "retorno", label: "Melhor dia/horário para retorno", input: "textarea" }
            ]
          },
          {
            id: newBlockId("contact"),
            kind: "contact_register",
            contact_profile_tag: "PERFIL DECISOR",
            fields: [...DEFAULT_CONTACT_REGISTER_FIELDS]
          }
        ],
        navigation: { mode: "sequential", next: encerramento }
      },
      [interesse]: {
        title: "Interesse",
        blocks: [
          {
            id: newBlockId("text"),
            kind: "text",
            content: `Hoje muitos postos usam o {{produto_nome}} para melhorar limite, prazo e previsibilidade no abastecimento.

Vocês já trabalham com algum programa de crédito/consórcio para combustível?`
          }
        ],
        navigation: {
          mode: "branch",
          question: "Demonstrou interesse em conhecer a solução?",
          choices: [
            { label: "Sim, quer conversar", next: agendamento },
            { label: "Não / sem interesse agora", next: objecao }
          ]
        }
      },
      [agendamento]: {
        title: "Agendamento",
        blocks: [
          {
            id: newBlockId("text"),
            kind: "text",
            content: "Ótimo! Vou agendar uma conversa de 15–20 minutos com nosso especialista."
          },
          { id: newBlockId("meet"), kind: "schedule_meeting", prompt: "Data e hora da reunião" }
        ],
        navigation: { mode: "sequential", next: null }
      },
      [objecao]: {
        title: "Objeção / retorno",
        blocks: [
          {
            id: newBlockId("text"),
            kind: "text",
            content: "Sem problema. Posso enviar material resumido ou retornar em outro momento."
          }
        ],
        navigation: { mode: "sequential", next: encerramento }
      },
      [encerramento]: {
        title: "Finalização",
        blocks: [
          {
            id: newBlockId("text"),
            kind: "text",
            content: "Agradeço o tempo! Registro o retorno e qualquer dúvida estamos à disposição."
          }
        ],
        navigation: { mode: "sequential", next: null }
      }
    }
  };
}

/** v1 legado (etapas lineares / ramificação / anotação). */
type LegacyStep =
  | { type: "linear"; title: string; content: string; next: string | null }
  | {
      type: "branch";
      title: string;
      content: string;
      question: string;
      choices: ScriptFlowBranchChoice[];
    }
  | {
      type: "capture";
      title: string;
      content: string;
      fields: ScriptFlowCaptureField[];
      next: string | null;
      create_contact?: "create";
      contact_profile_tag?: string;
    };

type LegacyFlow = { v: 1; start: string; steps: Record<string, LegacyStep> };

function migrateLegacyStep(id: string, step: LegacyStep): ScriptScreen {
  const blocks: ScriptScreenBlock[] = [];
  const pushText = (content: string) => {
    if (content.trim()) blocks.push({ id: newBlockId("text"), kind: "text", content });
  };

  pushText(step.content);

  if (step.type === "capture") {
    if (blocks.length === 0 && step.title) {
      blocks.push({ id: newBlockId("text"), kind: "text", content: "" });
    }
    if (step.fields?.length) {
      blocks.push({ id: newBlockId("notes"), kind: "notes", fields: step.fields.map((f) => ({ ...f })) });
    }
    if (step.create_contact === "create") {
      blocks.push({
        id: newBlockId("contact"),
        kind: "contact_register",
        contact_profile_tag: step.contact_profile_tag?.trim() || "PERFIL DECISOR",
        fields: [...DEFAULT_CONTACT_REGISTER_FIELDS]
      });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ id: newBlockId("text"), kind: "text", content: "" });
  }

  if (step.type === "branch") {
    return {
      title: step.title,
      blocks,
      navigation: {
        mode: "branch",
        question: step.question?.trim() || "Como seguir?",
        choices: step.choices.map((c) => ({ ...c }))
      }
    };
  }

  return {
    title: step.title,
    blocks,
    navigation: { mode: "sequential", next: step.next }
  };
}

function migrateLegacyFlow(flow: LegacyFlow): ScriptCallFlow {
  const screens: Record<string, ScriptScreen> = {};
  for (const [id, step] of Object.entries(flow.steps)) {
    screens[id] = migrateLegacyStep(id, step);
  }
  const start = flow.start in screens ? flow.start : Object.keys(screens)[0] ?? "scr_1";
  return { v: 2, start, screens };
}

export function isScriptCallFlow(value: unknown): value is ScriptCallFlow {
  if (!value || typeof value !== "object") return false;
  const o = value as ScriptCallFlow;
  return o.v === 2 && typeof o.start === "string" && o.screens != null && typeof o.screens === "object";
}

export function parseCallScriptBody(body: string): ScriptCallFlow | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isScriptCallFlow(parsed) && Object.keys(parsed.screens).length > 0) {
      const start = parsed.start in parsed.screens ? parsed.start : Object.keys(parsed.screens)[0]!;
      return { ...parsed, start };
    }
    const legacy = parsed as LegacyFlow;
    if (legacy?.v === 1 && legacy.steps?.[legacy.start]) {
      return enrichScreenLinks(migrateLegacyFlow(legacy));
    }
  } catch {
    /* texto legado */
  }
  const id = "scr_legacy";
  return {
    v: 2,
    start: id,
    screens: {
      [id]: {
        title: "Script",
        blocks: [{ id: newBlockId("text"), kind: "text", content: trimmed }],
        navigation: { mode: "sequential", next: null }
      }
    }
  };
}

export function serializeCallScriptFlow(flow: ScriptCallFlow): string {
  return JSON.stringify(flow);
}

function walkScreenNext(screen: ScriptScreen): string | null {
  if (screen.navigation.mode === "sequential") return screen.navigation.next;
  return null;
}

function walkScreenBranches(screen: ScriptScreen): Array<string | null> {
  if (screen.navigation.mode !== "branch") return [];
  return screen.navigation.choices.map((c) => c.next);
}

export function screenFlowToDrafts(flow: ScriptCallFlow): ScriptScreenDraft[] {
  const order = flowScreenOrder(flow);
  return order.map((id) => {
    const s = flow.screens[id]!;
    return {
      id,
      title: s.title,
      blocks: s.blocks.map((b) => ({ ...b })) as ScriptScreenBlock[],
      navigation: JSON.parse(JSON.stringify(s.navigation)) as ScriptScreenNavigation
    };
  });
}

export function ensureInternalScreenIds(drafts: ScriptScreenDraft[]): ScriptScreenDraft[] {
  const used = new Set<string>();
  return drafts.map((d, i) => {
    let id = d.id.trim();
    if (!id) id = `_scr${i + 1}`;
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    used.add(id);
    return id === d.id ? d : { ...d, id };
  });
}

function normalizeFields(fields: ScriptFlowCaptureField[]): ScriptFlowCaptureField[] {
  return fields
    .filter((f) => f.label.trim())
    .map((f, fi) => ({
      key: (f.key.trim() || `campo_${fi + 1}`).replace(/\s+/g, "_"),
      label: f.label.trim(),
      placeholder: f.placeholder?.trim() || undefined,
      input: f.input
    }));
}

export function draftsToScreenFlow(drafts: ScriptScreenDraft[]): ScriptCallFlow {
  const ordered = ensureInternalScreenIds(drafts);
  const screens: Record<string, ScriptScreen> = {};
  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i]!;
    const id = d.id.trim() || `scr-${i + 1}`;
    const blocks = d.blocks
      .map((b) => {
        if (b.kind === "text") return { ...b, content: b.content ?? "" };
        if (b.kind === "notes") {
          const fields = normalizeFields(b.fields ?? DEFAULT_CAPTURE_FIELDS);
          return { ...b, fields: fields.length ? fields : [...DEFAULT_CAPTURE_FIELDS] };
        }
        if (b.kind === "contact_register") {
          return {
            ...b,
            contact_profile_tag: (b.contact_profile_tag?.trim() || "PERFIL DECISOR").slice(0, 80),
            fields: contactRegisterFields(b)
          };
        }
        return { ...b };
      })
      .filter((b) => {
        if (b.kind === "text") return b.content.trim().length > 0 || ordered.length === 1;
        return true;
      });

    const safeBlocks = blocks.length > 0 ? blocks : [{ id: newBlockId("text"), kind: "text" as const, content: "" }];

    let navigation = d.navigation;
    if (navigation.mode === "sequential") {
      navigation = {
        mode: "sequential",
        next: navigation.next,
        ...(navigation.nextIsEnd ? { nextIsEnd: true } : {}),
        ...(navigation.allow_skip ? { allow_skip: true } : {})
      };
    } else {
      navigation = {
        mode: "branch",
        question: navigation.question?.trim() || "Como seguir?",
        choices: (navigation.choices ?? [])
          .filter((c) => c.label.trim())
          .map((c) => ({
            label: c.label.trim(),
            next: c.next,
            ...(c.contact_layer ? { contact_layer: c.contact_layer } : {}),
          }))
      };
    }

    screens[id] = {
      title: d.title.trim() || `Tela ${i + 1}`,
      blocks: safeBlocks,
      navigation
    };
  }
  const start = ordered[0]?.id.trim() || "scr-1";
  const screenOrder = ordered.map((d, i) => d.id.trim() || `scr-${i + 1}`);
  return {
    v: 2,
    start: screens[start] ? start : Object.keys(screens)[0] ?? "scr-1",
    screenOrder,
    screens
  };
}

export function enrichScreenLinks(flow: ScriptCallFlow): ScriptCallFlow {
  return draftsToScreenFlow(screenFlowToDrafts(flow));
}

export function normalizeCallScriptBodyForSave(body: string): string {
  const flow = parseCallScriptBody(body);
  if (!flow) return body;
  return serializeCallScriptFlow(draftsToScreenFlow(ensureInternalScreenIds(screenFlowToDrafts(flow))));
}

export function newScreenBlock(kind: ScriptScreenBlock["kind"]): ScriptScreenBlock {
  if (kind === "text") return { id: newBlockId("text"), kind: "text", content: "" };
  if (kind === "notes") return { id: newBlockId("notes"), kind: "notes", fields: [...DEFAULT_CAPTURE_FIELDS] };
  if (kind === "contact_register") {
    return {
      id: newBlockId("contact"),
      kind: "contact_register",
      contact_profile_tag: "PERFIL DECISOR",
      fields: [...DEFAULT_CONTACT_REGISTER_FIELDS]
    };
  }
  if (kind === "schedule_return") {
    return { id: newBlockId("ret"), kind: "schedule_return", prompt: "Data e hora do retorno" };
  }
  return { id: newBlockId("meet"), kind: "schedule_meeting", prompt: "Data e hora da reunião" };
}
