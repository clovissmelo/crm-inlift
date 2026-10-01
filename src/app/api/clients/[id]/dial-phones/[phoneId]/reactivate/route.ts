import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, nowIso, run } from "@/lib/db";
import { evaluateProspeccaoQueueAfterAttempt } from "@/lib/call-strategy/queue-eval";
import { z } from "zod";

type Params = { params: Promise<{ id: string; phoneId: string }> };

const bodySchema = z.object({
  reason: z.string().min(3).max(500)
});

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id, phoneId } = await params;
  const clientId = Number(id);
  const clientPhoneId = Number(phoneId);
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Informe o motivo" }, { status: 400 });
  }

  const phone = await get<{ id: number }>(
    "SELECT id FROM client_phones WHERE id = @phoneId AND client_id = @clientId",
    { phoneId: clientPhoneId, clientId }
  );
  if (!phone) return Response.json({ error: "Telefone não encontrado" }, { status: 404 });

  const now = nowIso();
  await run(
    `
      INSERT INTO client_phone_dial_state (
        client_phone_id, status, cycle_no_answer_count, cycle_invalid_count, cycle_wrong_number_count,
        next_eligible_at, exhausted_at, reactivated_at, reactivated_by_user_id, reactivation_reason, updated_at
      ) VALUES (@phoneId, 'available', 0, 0, 0, NULL, NULL, @now, @userId, @reason, @now)
      ON CONFLICT (client_phone_id) DO UPDATE SET
        status = 'available',
        cycle_no_answer_count = 0,
        cycle_invalid_count = 0,
        cycle_wrong_number_count = 0,
        next_eligible_at = NULL,
        exhausted_at = NULL,
        reactivated_at = @now,
        reactivated_by_user_id = @userId,
        reactivation_reason = @reason,
        updated_at = @now
    `,
    { phoneId: clientPhoneId, now, userId: user.id, reason: parsed.data.reason }
  );

  await evaluateProspeccaoQueueAfterAttempt(clientId);
  return Response.json({ ok: true });
}
