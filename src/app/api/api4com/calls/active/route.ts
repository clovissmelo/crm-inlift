import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listActiveCallsForUser } from "@/lib/api4com/calls";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await listActiveCallsForUser(user.id);
  return Response.json({ items });
}
