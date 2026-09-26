import { all, nowIso } from "@/lib/db";

export type ClientAgendaItem = {
  kind: "meeting" | "return";
  id: number;
  label: string;
  scheduled_at: string;
};

export async function listUpcomingClientAgendas(clientId: number): Promise<ClientAgendaItem[]> {
  const now = nowIso();

  const meetings = await all<{ id: number; title: string; starts_at: string }>(
    `
      SELECT id, title, starts_at
      FROM meetings
      WHERE client_id = @clientId
        AND status IN ('scheduled', 'confirmed', 'rescheduled')
        AND starts_at >= @now
      ORDER BY starts_at ASC
      LIMIT 20
    `,
    { clientId, now }
  );

  const returns = await all<{ id: number; scheduled_at: string; kind: string }>(
    `
      SELECT id, scheduled_at, kind
      FROM follow_ups
      WHERE client_id = @clientId
        AND status = 'pending'
      ORDER BY scheduled_at ASC
      LIMIT 20
    `,
    { clientId }
  );

  const items: ClientAgendaItem[] = [
    ...meetings.map((m) => ({
      kind: "meeting" as const,
      id: m.id,
      label: m.title,
      scheduled_at: m.starts_at
    })),
    ...returns.map((r) => ({
      kind: "return" as const,
      id: r.id,
      label: r.kind === "meeting" ? "Retorno (reunião)" : "Retorno",
      scheduled_at: r.scheduled_at
    }))
  ];

  items.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  return items;
}
