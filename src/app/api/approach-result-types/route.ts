import {
  serializeAllowedNextActions,
  parseAllowedNextActions,
  type ApproachNextActionKey
} from "@/lib/approach-next-actions";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, nowIso, run } from "@/lib/db";
import { catalogItemSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await all(
    "SELECT * FROM approach_result_types ORDER BY sort_order, name"
  );
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = await request.json();
  const parsed = catalogItemSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const slug = body.slug as string | undefined;
  if (!slug?.trim()) return Response.json({ error: "Informe um identificador (slug)" }, { status: 400 });
  const allowedKeys: ApproachNextActionKey[] = parsed.data.allowed_next_actions
    ? parseAllowedNextActions(parsed.data.allowed_next_actions)
    : ["none"];
  try {
    const result = await run(
      `
        INSERT INTO approach_result_types (slug, name, status, suggest_follow_up, lead_qualification, collect_notes, require_schedule_return, require_final_registration, ask_decision_maker, mark_phone_verified, allowed_next_actions, created_at, updated_at)
        VALUES (@slug, @name, @status, @suggestFollowUp, @leadQualification, @collectNotes, @requireScheduleReturn, @requireFinalRegistration, @askDecisionMaker, @markPhoneVerified, @allowedNextActions::jsonb, @now, @now)
      `,
      {
        slug: slug.trim(),
        name: parsed.data.name,
        status: parsed.data.status ?? "active",
        suggestFollowUp: parsed.data.suggest_follow_up ?? false,
        leadQualification: parsed.data.lead_qualification ?? null,
        collectNotes: parsed.data.collect_notes ?? false,
        requireScheduleReturn: parsed.data.require_schedule_return ?? false,
        requireFinalRegistration: parsed.data.require_final_registration ?? true,
        askDecisionMaker: parsed.data.ask_decision_maker ?? false,
        markPhoneVerified: parsed.data.mark_phone_verified ?? false,
        allowedNextActions: serializeAllowedNextActions(allowedKeys),
        now: nowIso()
      }
    );
    return Response.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível salvar (slug duplicado?)" }, { status: 400 });
  }
}
