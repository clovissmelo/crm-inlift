import { WarmScreenLeadsView } from "@/components/warm-screen-leads-view";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { buildProspeccaoPriorityFilterOptions } from "@/lib/prospeccao-priority";
import { queryWarmScreenLeadQueue } from "@/lib/warm-screen/queue";
import { isWarmScreenRunner } from "@/lib/warm-screen/permissions";
import { redirect } from "next/navigation";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

function defaultBdrUserId(user: User): number | undefined {
  if (!user.roles.includes("bdr")) return undefined;
  if (user.roles.includes("admin") || user.roles.includes("manager")) return undefined;
  return user.id;
}

export default async function AquecedorLeadsPage() {
  const user = await requireUser();
  if (!isWarmScreenRunner(user)) {
    redirect("/dashboard");
  }

  const defaultBdr = defaultBdrUserId(user);
  const { products, bdrs, companies } = await loadCatalog();
  const priorityTypes = await listProspeccaoPriorityTypes();
  const priorityFilters = buildProspeccaoPriorityFilterOptions(priorityTypes);

  const { items, total } = await queryWarmScreenLeadQueue({
    limit: 50,
    offset: 0,
    prioridade: "primeiro_contato",
    bdr_user_id: defaultBdr,
    exclude_warm_screen_confirmed: true
  });

  return (
    <WarmScreenLeadsView
      initialItems={items}
      initialTotal={total}
      products={products}
      bdrs={bdrs}
      companies={companies}
      priorityFilters={priorityFilters}
      defaultBdrUserId={defaultBdr ?? null}
      isAdmin={user.roles.includes("admin")}
    />
  );
}
