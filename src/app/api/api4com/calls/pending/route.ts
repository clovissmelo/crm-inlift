import { listPendingCallsForUser } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await listPendingCallsForUser(user.id);
  return Response.json({ items });
}
