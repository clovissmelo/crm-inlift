import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getClientTimeline } from "@/lib/timeline";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const items = await getClientTimeline(Number(id));
  return Response.json({ items });
}
