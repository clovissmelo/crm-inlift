import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { formatSpDateTime } from "@/lib/datetime";
import { getProspeccaoLeadsLastUpdatedAt } from "@/lib/prospeccao-meta";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const prospeccaoLeadsUpdatedAt = await getProspeccaoLeadsLastUpdatedAt();
  const prospeccaoLeadsUpdatedLabel = prospeccaoLeadsUpdatedAt
    ? formatSpDateTime(prospeccaoLeadsUpdatedAt)
    : null;

  return (
    <AppShell
      user={user}
      prospeccaoLeadsUpdatedAt={prospeccaoLeadsUpdatedAt}
      prospeccaoLeadsUpdatedLabel={prospeccaoLeadsUpdatedLabel}
    >
      {children}
    </AppShell>
  );
}
