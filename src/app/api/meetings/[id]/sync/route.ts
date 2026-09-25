import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { syncMeetingToGoogle } from "@/lib/google-calendar";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const result = await syncMeetingToGoogle(Number(id));
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
