import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { disconnectGoogle } from "@/lib/google-calendar";

export async function POST() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  await disconnectGoogle();
  return Response.json({ ok: true });
}
