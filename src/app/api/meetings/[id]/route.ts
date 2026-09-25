import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getMeetingDetail, updateMeeting, findMeetingConflicts } from "@/lib/meetings";
import { meetingUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const detail = await getMeetingDetail(Number(id));
  if (!detail) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const meetingId = Number(id);
  const body = await request.json();
  const parsed = meetingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  if (data.starts_at && data.internal_user_ids?.length) {
    const duration = data.duration_minutes ?? 30;
    const conflicts = await findMeetingConflicts(data.internal_user_ids, data.starts_at, duration, meetingId);
    if (conflicts.length && !body.confirm_conflicts) {
      return Response.json({ error: "Conflito de horário", conflicts }, { status: 409 });
    }
  }

  try {
    await updateMeeting(meetingId, user.id, data);
    const detail = await getMeetingDetail(meetingId);
    return Response.json(detail);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao atualizar" }, { status: 400 });
  }
}
