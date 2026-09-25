import { calendarRangeToUtcIso, formatYmdInSp, type CalendarRangeKind } from "@/lib/calendar-range";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { periodToRange, type DashboardPeriod } from "@/lib/datetime";
import { createMeeting, findMeetingConflicts, listMeetings } from "@/lib/meetings";
import { meetingCreateSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "mine" ? "mine" : "all";
  const rangeKind = url.searchParams.get("range") as CalendarRangeKind | null;
  const anchor = url.searchParams.get("date") ?? formatYmdInSp();
  let from: string | null = null;
  let to: string | null = null;
  if (rangeKind === "day" || rangeKind === "week" || rangeKind === "month") {
    const r = calendarRangeToUtcIso(rangeKind, anchor);
    from = r.from;
    to = r.to;
  } else {
    const period = (url.searchParams.get("period") ?? "all") as DashboardPeriod;
    const range = periodToRange(period);
    from = range.from;
    to = range.to;
  }

  const items = await listMeetings({
    scope,
    user_id: user.id,
    bdr_user_id: url.searchParams.get("bdr_user_id") ? Number(url.searchParams.get("bdr_user_id")) : undefined,
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    status: url.searchParams.get("status") ?? undefined,
    participant_user_id: url.searchParams.get("participant_user_id")
      ? Number(url.searchParams.get("participant_user_id"))
      : undefined,
    from,
    to
  });

  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const idempotencyKey = request.headers.get("Idempotency-Key") ?? undefined;
  const body = await request.json();
  const parsed = meetingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const conflicts = await findMeetingConflicts(data.internal_user_ids, data.starts_at, data.duration_minutes);
  if (conflicts.length && !body.confirm_conflicts) {
    return Response.json({ error: "Conflito de horário", conflicts }, { status: 409 });
  }

  try {
    const result = await createMeeting({
      ...data,
      external_participants: data.external_participants ?? [],
      created_by_user_id: user.id,
      idempotency_key: data.idempotency_key ?? idempotencyKey ?? null
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
