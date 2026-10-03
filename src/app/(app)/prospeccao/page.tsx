import { Suspense } from "react";
import { ProspeccaoListView } from "@/components/prospeccao-list-view";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { buildProspeccaoPriorityFilterOptions } from "@/lib/prospeccao-priority";
import { sortPrioritiesForDisplay } from "@/lib/prospeccao-priority-queue-admin";
import { queryProspeccaoQueue } from "@/lib/prospeccao-query";

export const dynamic = "force-dynamic";

export default async function ProspeccaoPage() {
  await requireUser();
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
  const { items, total } = await queryProspeccaoQueue({ limit: 50, offset: 0 });
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
      />
    </Suspense>
  );
}
