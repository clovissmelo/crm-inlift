import { getCallDetailForUser } from "@/lib/api4com/calls";
import {
  getClientProductIds,
  listClientDialOptions,
  resolveDialSessionRootId
} from "@/lib/api4com/dial-queue";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const callId = Number(id);
  const call = await getCallDetailForUser(callId, user.id);
  if (!call) return Response.json({ error: "Não encontrado" }, { status: 404 });

  const sessionRootId = await resolveDialSessionRootId(callId);
  const clientId = call.client_id;
  if (!clientId) {
    return Response.json({
      call,
      session_root_id: sessionRootId,
      remaining: [] as unknown[],
      skipped: [] as unknown[],
      session_calls: [] as unknown[],
      client_product_ids: [] as number[]
    });
  }

  const [remaining, skipped, sessionCalls, clientProductIds] = await Promise.all([
    listClientDialOptions(clientId, sessionRootId),
    all<{ contact_id: number | null; phone: string; created_at: string }>(
      `
        SELECT contact_id, phone, created_at FROM api4com_dial_skips
        WHERE dial_session_root_id = @sessionRoot
        ORDER BY created_at ASC
      `,
      { sessionRoot: sessionRootId }
    ),
    all<{
      id: number;
      contact_id: number | null;
      phone_dialed: string;
      ended_at: string | null;
      duration_seconds: number | null;
    }>(
      `
        SELECT id, contact_id, phone_dialed, ended_at, duration_seconds
        FROM api4com_calls
        WHERE client_id = @clientId
          AND COALESCE(dial_session_root_id, id) = @sessionRoot
          AND status = 'completed'
        ORDER BY ended_at ASC NULLS LAST, id ASC
      `,
      { clientId, sessionRoot: sessionRootId }
    ),
    getClientProductIds(clientId)
  ]);

  return Response.json({
    call,
    session_root_id: sessionRootId,
    remaining,
    skipped,
    session_calls: sessionCalls,
    client_product_ids: clientProductIds
  });
}
