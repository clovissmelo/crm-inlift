import { all } from "@/lib/db";
import { formatSpDateTime } from "@/lib/datetime";
import { MEETING_STATUS_LABELS, type MeetingStatus } from "@/lib/meeting-constants";

export type TimelineItem = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  occurred_at: string;
  user_name: string | null;
  meet_link?: string | null;
};

export async function getClientTimeline(clientId: number): Promise<TimelineItem[]> {
  const items: TimelineItem[] = [];

  const apiCalls = await all<{
    id: number;
    status: string;
    created_at: string;
    ended_at: string | null;
    started_at: string | null;
    duration_seconds: number | null;
    phone_dialed: string;
    hangup_cause_label: string | null;
    technical_provider_code: string | null;
    technical_provider_label: string | null;
    user_name: string | null;
    approach_id: number | null;
    result_name: string | null;
    approach_notes: string | null;
    error_message: string | null;
    technical_name: string | null;
    contact_outcome_name: string | null;
    commercial_name: string | null;
    contacted_person_name: string | null;
    bdr_name: string | null;
  }>(
    `
      SELECT c.id, c.status, c.created_at, c.ended_at, c.started_at, c.duration_seconds, c.phone_dialed,
        c.hangup_cause_label, c.technical_provider_code, c.technical_provider_label, c.error_message,
        u.name AS user_name, c.approach_id,
        COALESCE(a.commercial_result_name_snapshot, rt.name) AS result_name,
        a.notes AS approach_notes,
        COALESCE(a.technical_result_name_snapshot, tr.display_name) AS technical_name,
        a.contact_outcome_name_snapshot AS contact_outcome_name,
        COALESCE(a.commercial_result_name_snapshot, rt.name) AS commercial_name,
        a.contacted_person_name,
        bu.name AS bdr_name
      FROM api4com_calls c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN approaches a ON a.id = c.approach_id
      LEFT JOIN users bu ON bu.id = a.user_id
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      LEFT JOIN call_technical_result_types tr ON tr.id = c.technical_result_type_id
      WHERE c.client_id = @clientId
        AND c.status IN ('initiating', 'ringing', 'in_progress', 'completed', 'failed')
      ORDER BY COALESCE(c.ended_at, c.started_at, c.created_at) DESC
    `,
    { clientId }
  );

  for (const call of apiCalls) {
    const when = call.ended_at ?? call.started_at ?? call.created_at;
    const techParts = [
      call.phone_dialed,
      call.duration_seconds != null ? `${call.duration_seconds}s` : null,
      call.technical_name ? `Técnico: ${call.technical_name}` : null,
      call.technical_provider_label
        ? `Provedor: ${call.technical_provider_label}${call.technical_provider_code ? ` (${call.technical_provider_code})` : ""}`
        : call.hangup_cause_label
          ? `Provedor: ${call.hangup_cause_label}`
          : null
    ].filter(Boolean);
    let title = "Ligação";
    if (call.status === "failed") title = "Ligação (falhou ao discar)";
    else if (call.status === "initiating" || call.status === "ringing" || call.status === "in_progress") {
      title = "Ligação (em andamento)";
    } else if (call.approach_id) title = "Ligação registrada";

    let bdrParts: string[];
    if (call.status === "failed") {
      bdrParts = call.error_message ? [call.error_message] : ["Discagem não concluída"];
    } else if (call.status !== "completed") {
      bdrParts = ["Aguardando retorno da telefonia"];
    } else if (call.approach_id) {
      bdrParts = [
        call.contact_outcome_name ? `Contato: ${call.contact_outcome_name}` : null,
        call.contacted_person_name ? `Pessoa: ${call.contacted_person_name}` : null,
        call.commercial_name ? `Comercial: ${call.commercial_name}` : null,
        call.approach_notes
      ].filter(Boolean) as string[];
    } else {
      bdrParts = ["Classificação BDR pendente"];
    }

    items.push({
      id: `api4com-${call.id}`,
      kind: "api4com_call",
      title,
      detail: [...techParts, ...bdrParts].join(" · ") || null,
      occurred_at: when,
      user_name: call.bdr_name ?? call.user_name
    });
  }

  const approaches = await all<{
    id: number;
    occurred_at: string;
    channel: string;
    notes: string | null;
    result_name: string | null;
    user_name: string | null;
    product_name: string | null;
    contact_outcome_name: string | null;
    commercial_name: string | null;
    technical_name: string | null;
    contacted_person_name: string | null;
  }>(
    `
      SELECT a.id, a.occurred_at, a.channel, a.notes,
        COALESCE(a.commercial_result_name_snapshot, rt.name) AS result_name,
        u.name AS user_name, p.name AS product_name,
        a.contact_outcome_name_snapshot AS contact_outcome_name,
        COALESCE(a.commercial_result_name_snapshot, rt.name) AS commercial_name,
        a.technical_result_name_snapshot AS technical_name,
        a.contacted_person_name
      FROM approaches a
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN products p ON p.id = a.product_id
      WHERE a.client_id = @clientId
        AND NOT EXISTS (SELECT 1 FROM api4com_calls ac WHERE ac.approach_id = a.id)
      ORDER BY a.occurred_at DESC
    `,
    { clientId }
  );

  for (const a of approaches) {
    const channelLabel = a.channel === "whatsapp" ? "WhatsApp" : a.channel === "email" ? "E-mail" : "Ligação";
    const layerParts = [
      a.technical_name ? `Técnico: ${a.technical_name}` : null,
      a.contact_outcome_name ? `Contato: ${a.contact_outcome_name}` : null,
      a.contacted_person_name ? `Pessoa: ${a.contacted_person_name}` : null,
      a.commercial_name ? `Comercial: ${a.commercial_name}` : null
    ].filter(Boolean);
    items.push({
      id: `approach-${a.id}`,
      kind: "approach",
      title: `Abordagem (${channelLabel})${a.result_name ? ` — ${a.result_name}` : ""}`,
      detail: [a.product_name, ...layerParts, a.notes].filter(Boolean).join(" · ") || null,
      occurred_at: a.occurred_at,
      user_name: a.user_name
    });
  }

  const followUps = await all<{
    id: number;
    scheduled_at: string;
    status: string;
    notes: string | null;
    kind: string;
    created_by_name: string | null;
    assigned_name: string | null;
    completed_at: string | null;
  }>(
    `
      SELECT f.id, f.scheduled_at, f.status, f.notes, f.kind, f.completed_at,
        cu.name AS created_by_name, au.name AS assigned_name
      FROM follow_ups f
      LEFT JOIN users cu ON cu.id = f.created_by_user_id
      LEFT JOIN users au ON au.id = f.assigned_user_id
      WHERE f.client_id = @clientId
      ORDER BY f.scheduled_at DESC
    `,
    { clientId }
  );

  for (const f of followUps) {
    const label = f.kind === "meeting" ? "Reunião" : "Retorno";
    items.push({
      id: `follow-${f.id}-scheduled`,
      kind: "follow_up",
      title: `${label} agendado${f.status === "completed" ? " (concluído)" : ""}`,
      detail: f.notes,
      occurred_at: f.scheduled_at,
      user_name: f.created_by_name
    });
    if (f.completed_at) {
      items.push({
        id: `follow-${f.id}-done`,
        kind: "follow_up_completed",
        title: `${label} concluído`,
        detail: null,
        occurred_at: f.completed_at,
        user_name: f.assigned_name
      });
    }
  }

  const verifications = await all<{
    id: number;
    created_at: string;
    new_status: string;
    user_name: string | null;
    contact_name: string;
  }>(
    `
      SELECT l.id, l.created_at, l.new_status, u.name AS user_name, c.name AS contact_name
      FROM contact_verification_logs l
      JOIN contacts c ON c.id = l.contact_id
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.client_id = @clientId
      ORDER BY l.created_at DESC
    `,
    { clientId }
  );

  for (const v of verifications) {
    items.push({
      id: `verify-${v.id}`,
      kind: "verification",
      title: `Verificação: ${v.contact_name}`,
      detail: v.new_status,
      occurred_at: v.created_at,
      user_name: v.user_name
    });
  }

  const temps = await all<{
    id: number;
    created_at: string;
    new_temperature: string | null;
    product_name: string;
    user_name: string | null;
  }>(
    `
      SELECT l.id, l.created_at, l.new_temperature, p.name AS product_name, u.name AS user_name
      FROM opportunity_temperature_logs l
      JOIN products p ON p.id = l.product_id
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.client_id = @clientId
      ORDER BY l.created_at DESC
    `,
    { clientId }
  );

  for (const t of temps) {
    items.push({
      id: `temp-${t.id}`,
      kind: "temperature",
      title: `Temperatura (${t.product_name})`,
      detail: t.new_temperature,
      occurred_at: t.created_at,
      user_name: t.user_name
    });
  }

  const transfers = await all<{
    id: number;
    created_at: string;
    from_name: string | null;
    to_name: string | null;
    by_name: string | null;
  }>(
    `
      SELECT l.id, l.created_at, fu.name AS from_name, tu.name AS to_name, bu.name AS by_name
      FROM bdr_transfer_log_clients tc
      JOIN bdr_transfer_logs l ON l.id = tc.log_id
      LEFT JOIN users fu ON fu.id = l.from_bdr_user_id
      JOIN users tu ON tu.id = l.to_bdr_user_id
      JOIN users bu ON bu.id = l.transferred_by_user_id
      WHERE tc.client_id = @clientId
      ORDER BY l.created_at DESC
    `,
    { clientId }
  );

  for (const tr of transfers) {
    items.push({
      id: `transfer-${tr.id}`,
      kind: "bdr_transfer",
      title: "Transferência de BDR",
      detail: `De ${tr.from_name ?? "—"} para ${tr.to_name ?? "—"}`,
      occurred_at: tr.created_at,
      user_name: tr.by_name
    });
  }

  const engagements = await all<{
    id: number;
    updated_at: string;
    engagement_status: string;
    product_name: string;
    pause_name: string | null;
    close_name: string | null;
    user_name: string | null;
  }>(
    `
      SELECT o.id, o.status_changed_at AS updated_at, o.engagement_status, p.name AS product_name,
        pr.name AS pause_name, cr.name AS close_name, u.name AS user_name
      FROM opportunities o
      JOIN products p ON p.id = o.product_id
      LEFT JOIN closure_reason_types pr ON pr.id = o.pause_reason_id
      LEFT JOIN closure_reason_types cr ON cr.id = o.close_reason_id
      LEFT JOIN users u ON u.id = o.status_changed_by_user_id
      WHERE o.client_id = @clientId AND o.engagement_status <> 'active'
      ORDER BY o.status_changed_at DESC NULLS LAST
    `,
    { clientId }
  );

  const meetings = await all<{
    id: number;
    title: string;
    starts_at: string;
    status: string;
    meet_link: string | null;
    user_name: string | null;
  }>(
    `
      SELECT m.id, m.title, m.starts_at, m.status, m.meet_link, u.name AS user_name
      FROM meetings m
      LEFT JOIN users u ON u.id = m.created_by_user_id
      WHERE m.client_id = @clientId
      ORDER BY m.starts_at DESC
    `,
    { clientId }
  );

  for (const m of meetings) {
    items.push({
      id: `meeting-${m.id}`,
      kind: "meeting",
      title: `Reunião: ${m.title} (${MEETING_STATUS_LABELS[m.status as MeetingStatus] ?? m.status})`,
      detail: null,
      occurred_at: m.starts_at,
      user_name: m.user_name,
      meet_link: m.meet_link
    });
  }

  const meetingLogs = await all<{
    id: number;
    to_status: string;
    reason: string | null;
    created_at: string;
    user_name: string | null;
    title: string;
    meet_link: string | null;
  }>(
    `
      SELECT l.id, l.to_status, l.reason, l.created_at, u.name AS user_name, m.title, m.meet_link
      FROM meeting_status_logs l
      JOIN meetings m ON m.id = l.meeting_id
      LEFT JOIN users u ON u.id = l.user_id
      WHERE m.client_id = @clientId
      ORDER BY l.created_at DESC
    `,
    { clientId }
  );

  for (const l of meetingLogs) {
    let title = `Reunião "${l.title}": ${MEETING_STATUS_LABELS[l.to_status as MeetingStatus] ?? l.to_status}`;
    const reason = l.reason?.trim() ?? "";
    if (reason.startsWith("Cancelado para mim")) {
      title = `Reunião "${l.title}": cancelada para mim`;
    } else if (reason.startsWith("Cancelado para todos") || l.to_status === "cancelled") {
      title = `Reunião "${l.title}": cancelada para todos`;
    }
    items.push({
      id: `meeting-log-${l.id}`,
      kind: "meeting_status",
      title,
      detail: reason || null,
      occurred_at: l.created_at,
      user_name: l.user_name,
      meet_link: l.meet_link
    });
  }

  const stageLogs = await all<{
    id: number;
    created_at: string;
    notes: string | null;
    user_name: string | null;
    to_stage_name: string;
    opp_title: string;
  }>(
    `
      SELECT l.id, l.created_at, l.notes, u.name AS user_name, ts.name AS to_stage_name, o.title AS opp_title
      FROM opportunity_stage_logs l
      JOIN opportunities o ON o.id = l.opportunity_id
      JOIN pipeline_stages ts ON ts.id = l.to_stage_id
      LEFT JOIN users u ON u.id = l.user_id
      WHERE o.client_id = @clientId
      ORDER BY l.created_at DESC
    `,
    { clientId }
  );

  for (const s of stageLogs) {
    items.push({
      id: `opp-stage-${s.id}`,
      kind: "opportunity_stage",
      title: `Oportunidade "${s.opp_title}": etapa ${s.to_stage_name}`,
      detail: s.notes,
      occurred_at: s.created_at,
      user_name: s.user_name
    });
  }

  for (const e of engagements) {
    items.push({
      id: `eng-${e.id}`,
      kind: e.engagement_status,
      title: e.engagement_status === "paused" ? `Pausa (${e.product_name})` : `Encerramento (${e.product_name})`,
      detail: e.pause_name || e.close_name,
      occurred_at: e.updated_at ?? new Date(0).toISOString(),
      user_name: e.user_name
    });
  }

  items.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  return items;
}

export { formatSpDateTime };
