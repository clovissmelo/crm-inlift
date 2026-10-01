import { all } from "@/lib/db";

export type ProspeccaoPriorityTypeRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  rule_kind: string;
  rule_params?: string | null;
  queue_anchor?: "start" | "end" | "none";
  is_system?: boolean;
  status: string;
};

const FALLBACK: ProspeccaoPriorityTypeRow[] = [
  {
    id: 4,
    slug: "primeiro_contato",
    name: "Primeiro contato",
    description: null,
    color: "#64748b",
    sort_order: 1,
    rule_kind: "first_contact",
    queue_anchor: "start",
    is_system: true,
    status: "active"
  },
  {
    id: 1,
    slug: "reagendar",
    name: "Reagendar",
    description: null,
    color: "#dc2626",
    sort_order: 10,
    rule_kind: "overdue_return",
    queue_anchor: "none",
    is_system: true,
    status: "active"
  },
  {
    id: 3,
    slug: "acompanhamento",
    name: "Acompanhamento",
    description: null,
    color: "#ca8a04",
    sort_order: 20,
    rule_kind: "has_approach",
    queue_anchor: "none",
    is_system: true,
    status: "active"
  },
  {
    id: 2,
    slug: "retorno",
    name: "Retorno",
    description: null,
    color: "#2563eb",
    sort_order: 100_000,
    rule_kind: "return_due",
    queue_anchor: "end",
    is_system: true,
    status: "active"
  }
];

export async function listProspeccaoPriorityTypes(): Promise<ProspeccaoPriorityTypeRow[]> {
  try {
    const rows = await all<ProspeccaoPriorityTypeRow>(
      `
        SELECT id, slug, name, description, color, sort_order, rule_kind, rule_params,
          COALESCE(queue_anchor, 'none') AS queue_anchor,
          COALESCE(is_system, true) AS is_system,
          status
        FROM prospeccao_priority_types
        WHERE status = 'active'
        ORDER BY sort_order, id
      `
    );
    return rows.length ? rows : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function queuePriorityToSlug(queuePriority: number): string {
  if (queuePriority === 0) return "reagendar";
  if (queuePriority === 1) return "retorno";
  if (queuePriority === 2) return "acompanhamento";
  return "primeiro_contato";
}

export async function resolveQueueLabel(queuePriority: number): Promise<string> {
  const slug = queuePriorityToSlug(queuePriority);
  const types = await listProspeccaoPriorityTypes();
  return types.find((t) => t.slug === slug)?.name ?? slug;
}
