import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getWarmScreenAssistedCallContext } from "@/lib/warm-screen/assisted-call";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const ctx = await getWarmScreenAssistedCallContext(user.id);
  return Response.json({
    activeCall: ctx.activeCall,
    resultCallId: ctx.resultCallId
  });
}
