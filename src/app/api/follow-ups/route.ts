import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listFollowUps } from "@/lib/follow-ups";
import { periodToRange, type DashboardPeriod } from "@/lib/datetime";
import { nowIso, run } from "@/lib/db";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const section = (url.searchParams.get("section") ?? "today") as "overdue" | "today" | "upcoming" | "completed";
  const period = (url.searchParams.get("period") ?? "all") as DashboardPeriod;
  const range = periodToRange(period);

  const items = await listFollowUps({
    section,
    bdr_user_id: url.searchParams.get("bdr_user_id") ? Number(url.searchParams.get("bdr_user_id")) : undefined,
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    lead_qualification: (() => {
      const q = url.searchParams.get("lead_qualification");
      return q === "cold" || q === "warm" || q === "hot" ? q : undefined;
    })(),
    period_from: range.from,
    period_to: range.to
  });

  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = (await request.json()) as {
    client_id: number;
    contact_id?: number;
    product_id?: number;
    scheduled_at: string;
    kind?: "return" | "meeting";
    notes?: string;
    source_approach_id?: number;
  };
  if (!body.client_id || !body.scheduled_at) {
    return Response.json({ error: "Dados incompletos" }, { status: 400 });
  }
  const client = await (await import("@/lib/db")).get<{ bdr_user_id: number | null }>(
    "SELECT bdr_user_id FROM clients WHERE id = @id",
    { id: body.client_id }
  );
  const assigned = client?.bdr_user_id ?? user.id;
  const result = await run(
    `
      INSERT INTO follow_ups (
        client_id, contact_id, product_id, source_approach_id, kind,
        assigned_user_id, created_by_user_id, scheduled_at, status, notes, created_at, updated_at
      ) VALUES (
        @clientId, @contactId, @productId, @sourceApproachId, @kind,
        @assignedUserId, @createdBy, @scheduledAt, 'pending', @notes, @now, @now
      )
    `,
    {
      clientId: body.client_id,
      contactId: body.contact_id ?? null,
      productId: body.product_id ?? null,
      sourceApproachId: body.source_approach_id ?? null,
      kind: body.kind ?? "return",
      assignedUserId: assigned,
      createdBy: user.id,
      scheduledAt: body.scheduled_at,
      notes: body.notes ?? null,
      now: nowIso()
    }
  );
  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
