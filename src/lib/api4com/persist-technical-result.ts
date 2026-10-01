import { resolveTechnicalResultForCall } from "@/lib/classifications/technical-result";
import { get, nowIso, run } from "@/lib/db";

type CallSignals = {
  id: number;
  hangup_cause_code: string | null;
  hangup_cause_label: string | null;
  duration_seconds: number | null;
  answered_at: string | null;
  approach_id: number | null;
};

/** Persiste resultado técnico normalizado + códigos originais do provedor. Não altera classificação BDR. */
export async function persistCallTechnicalResult(callId: number) {
  const row = await get<CallSignals>(
    `
      SELECT id, hangup_cause_code, hangup_cause_label, duration_seconds, answered_at, approach_id
      FROM api4com_calls WHERE id = @id
    `,
    { id: callId }
  );
  if (!row) return null;

  const matched = await resolveTechnicalResultForCall({
    hangup_cause_code: row.hangup_cause_code,
    hangup_cause_label: row.hangup_cause_label,
    duration_seconds: row.duration_seconds,
    answered_at: row.answered_at
  });

  const now = nowIso();
  await run(
    `
      UPDATE api4com_calls SET
        technical_result_type_id = @typeId,
        technical_provider_code = @providerCode,
        technical_provider_label = @providerLabel,
        technical_inferred_at = @now,
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: callId,
      typeId: matched?.id ?? null,
      providerCode: row.hangup_cause_code,
      providerLabel: row.hangup_cause_label,
      now
    }
  );

  if (row.approach_id && matched?.display_name) {
    await run(
      `
        UPDATE approaches SET technical_result_name_snapshot = @name
        WHERE id = @approachId AND (technical_result_name_snapshot IS NULL OR technical_result_name_snapshot = '')
      `,
      { approachId: row.approach_id, name: matched.display_name }
    );
  }

  if (!row.approach_id && matched && !matched.answered) {
    const { tryServerAutoRegisterNoContact } = await import("@/lib/attendance/auto-register-no-contact");
    await tryServerAutoRegisterNoContact(callId);
  }

  return matched;
}
