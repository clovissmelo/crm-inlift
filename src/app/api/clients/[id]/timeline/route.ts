import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getClientTimeline, type OpportunityTimelineScope } from "@/lib/timeline";

type Params = { params: Promise<{ id: string }> };

function parseTimelineScope(raw: string | null): OpportunityTimelineScope {
  if (raw === "inactive" || raw === "all") return raw;
  return "active";
}

export async function GET(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const scope = parseTimelineScope(new URL(request.url).searchParams.get("opportunity_scope"));
  const items = await getClientTimeline(Number(id), scope);
  return Response.json({ items });
}
