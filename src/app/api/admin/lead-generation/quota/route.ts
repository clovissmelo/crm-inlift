import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { buildLeadGenQuotaPanel } from "@/lib/lead-generation/quota-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  return Response.json(await buildLeadGenQuotaPanel(), {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
