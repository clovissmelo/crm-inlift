import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { cancelMeeting, getMeetingDetail } from "@/lib/meetings";
import { z } from "zod";

const bodySchema = z.object({
  scope: z.enum(["self", "all"]),
  reason: z.string().trim().max(500).optional().nullable()
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const meetingId = Number(id);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  try {
    await cancelMeeting(meetingId, user.id, {
      scope: parsed.data.scope,
      reason: parsed.data.reason ?? null
    });
    const detail = await getMeetingDetail(meetingId);
    return Response.json(detail);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao cancelar" }, { status: 400 });
  }
}
