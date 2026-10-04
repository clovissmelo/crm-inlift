import { Suspense } from "react";
import { ProspeccaoListView } from "@/components/prospeccao-list-view";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { buildProspeccaoPriorityFilterOptions } from "@/lib/prospeccao-priority";
import { sortPrioritiesForDisplay } from "@/lib/prospeccao-priority-queue-admin";
import { queryProspeccaoQueue } from "@/lib/prospeccao-query";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

function defaultProspeccaoBdrUserId(user: User): number | undefined {
  if (!user.roles.includes("bdr")) return undefined;
  if (user.roles.includes("admin") || user.roles.includes("manager")) return undefined;
  return user.id;
}

export default async function ProspeccaoPage() {
  const user = await requireUser();
  const defaultBdrUserId = defaultProspeccaoBdrUserId(user);
  const { products, bdrs, companies } = await loadCatalog();
  const priorityTypes = await listProspeccaoPriorityTypes();
  const priorityFilters = buildProspeccaoPriorityFilterOptions(priorityTypes);
  const priorityLegend = sortPrioritiesForDisplay(priorityTypes).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    color: p.color,
    description: p.description,
    rule_kind: p.rule_kind,
    queue_anchor: p.queue_anchor ?? "none",
    sort_order: p.sort_order
  }));
  const { items, total } = await queryProspeccaoQueue({
    limit: 50,
    offset: 0,
    bdr_user_id: defaultBdrUserId
  });
  return (
    <Suspense fallback={<p className="muted">Carregando…</p>}>
      <ProspeccaoListView
        initialItems={items}
        initialTotal={total}
        products={products}
        bdrs={bdrs}
        companies={companies}
        priorityFilters={priorityFilters}
        priorityLegend={priorityLegend}
        defaultBdrUserId={defaultBdrUserId ?? null}
      />
    </Suspense>
  );
}
