import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { previewReEvaluateDialLimits } from "@/lib/call-strategy/re-evaluate-limits";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const preview = await previewReEvaluateDialLimits();
  return Response.json({ preview });
}
