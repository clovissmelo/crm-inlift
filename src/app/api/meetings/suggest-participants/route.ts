import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { suggestInternalParticipants } from "@/lib/meetings";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  const bdrUserId = Number(url.searchParams.get("bdr_user_id") ?? user.id);
  const participants = await suggestInternalParticipants(productId ? Number(productId) : null, bdrUserId);
  return Response.json({ participants });
}
