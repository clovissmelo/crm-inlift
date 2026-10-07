import { requireAdminApi } from "@/lib/admin";
import { fetchApi4comExtensionDetails } from "@/lib/api4com/fetch-extensions-detail";
import { requireApiUser } from "@/lib/auth";

/** Admin: consulta GET /extensions na API4COM (senha SIP se a API expuser). */
export async function GET() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const result = await fetchApi4comExtensionDetails();
  if (!result.ok) {
    return Response.json(result, { status: result.http_status || 502 });
  }
  return Response.json(result);
}
