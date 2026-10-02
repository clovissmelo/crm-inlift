import { dismissPendingCallResult, getCallById } from "@/lib/api4com/calls";
import { callRequiresComplementRegistration } from "@/lib/api4com/call-registration";
import { persistCallTechnicalResult } from "@/lib/api4com/persist-technical-result";
import { tryServerAutoRegisterNoContact } from "@/lib/attendance/auto-register-no-contact";
import { get } from "@/lib/db";

export async function autoSettleApi4comCall(callId: number, userId: number): Promise<{
  registered: boolean;
  requires_complement: boolean;
}> {
  const row = await getCallById(callId);
  if (!row || row.user_id !== userId) throw new Error("Chamada não encontrada");

  await persistCallTechnicalResult(callId);

  const registered = await tryServerAutoRegisterNoContact(callId);
  if (registered) {
    return { registered: true, requires_complement: false };
  }

  const fresh = await get<{
    answered_at: string | null;
    technical_slug: string | null;
    duration_seconds: number | null;
    result_pending: boolean;
    approach_id: number | null;
  }>(
    `
      SELECT c.answered_at, tr.slug AS technical_slug, c.duration_seconds, c.result_pending, c.approach_id
      FROM api4com_calls c
      LEFT JOIN call_technical_result_types tr ON tr.id = c.technical_result_type_id
      WHERE c.id = @id
    `,
    { id: callId }
  );

  const requires_complement = fresh
    ? callRequiresComplementRegistration({
        answered_at: fresh.answered_at,
        technical_slug: fresh.technical_slug,
        duration_seconds: fresh.duration_seconds
      })
    : false;

  if (!requires_complement && fresh?.result_pending && !fresh.approach_id) {
    await dismissPendingCallResult(callId, userId);
  }

  return { registered: false, requires_complement };
}
