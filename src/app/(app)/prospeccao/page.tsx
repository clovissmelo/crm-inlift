import { Suspense } from "react";
import { ProspeccaoListView } from "@/components/prospeccao-list-view";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { buildProspeccaoPriorityFilterOptions } from "@/lib/prospeccao-priority";
import { queryProspeccaoQueue } from "@/lib/prospeccao-query";

export const dynamic = "force-dynamic";

export default async function ProspeccaoPage() {
  const user = await requireUser();
  const { products, bdrs, companies } = await loadCatalog();
  const priorityTypes = await listProspeccaoPriorityTypes();
  const priorityFilters = buildProspeccaoPriorityFilterOptions(priorityTypes);
  const queuePriorities = priorityTypes.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    color: p.color,
    sort_order: p.sort_order,
    rule_kind: p.rule_kind,
    rule_params: p.rule_params ?? null,
    queue_anchor: p.queue_anchor ?? "none"
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
        queuePriorities={queuePriorities}
        canEditQueueOrder={isAdmin(user)}
      />
    </Suspense>
  );
}
