import { createApproach } from "@/lib/approaches";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { completeFollowUp } from "@/lib/follow-ups";
import { approachCreateSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const body = await request.json();
  const parsed = approachCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const resultType = await get<{ suggest_follow_up: boolean }>(
    "SELECT suggest_follow_up FROM approach_result_types WHERE id = @id AND status = 'active'",
    { id: data.result_type_id }
  );
  if (!resultType) return Response.json({ error: "Resultado inválido" }, { status: 400 });

  if (resultType.suggest_follow_up && data.next_action.type === "none") {
    return Response.json(
      { error: "Este resultado sugere uma próxima ação (retorno, reunião, pausa ou encerramento)." },
      { status: 400 }
    );
  }

  if (data.occurred_at) {
    const occurred = new Date(data.occurred_at);
    if (occurred.getTime() > Date.now()) {
      return Response.json({ error: "Data da abordagem não pode ser futura." }, { status: 400 });
    }
  }

  try {
    const approachId = await createApproach({
      client_id: data.client_id,
      contact_id: data.contact_id,
      product_id: data.product_id,
      user_id: user.id,
      channel: data.channel,
      occurred_at: data.occurred_at,
      result_type_id: data.result_type_id,
      notes: data.notes,
      external_call_id: data.external_call_id,
      next_action: data.next_action
    });

    if (data.follow_up_id) {
      await completeFollowUp(data.follow_up_id, user.id, approachId);
    }

    return Response.json({ id: approachId }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
