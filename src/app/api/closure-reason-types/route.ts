import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all } from "@/lib/db";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await all("SELECT * FROM closure_reason_types WHERE status = 'active' ORDER BY kind, sort_order, name");
  return Response.json({ items });
}
