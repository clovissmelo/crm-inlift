import { getApi4comTokenPolicy } from "@/lib/api4com/token-policy";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const policy = await getApi4comTokenPolicy();
  return Response.json({ policy });
}
