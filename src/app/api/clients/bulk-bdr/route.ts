import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { queryAllMatchingClientIds } from "@/lib/clients-query";
import { reassignPendingFollowUpsForClients } from "@/lib/follow-ups";
import { nowIso, run } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const body = (await request.json()) as {
    to_bdr_user_id: number;
    client_ids?: number[];
    select_all?: boolean;
    filters?: Record<string, string | number | boolean | undefined>;
  };

  if (!body.to_bdr_user_id) {
    return Response.json({ error: "Informe a BDR de destino" }, { status: 400 });
  }

  let clientIds = body.client_ids ?? [];
  if (body.select_all) {
    clientIds = await queryAllMatchingClientIds({
      city: body.filters?.city as string | undefined,
      uf: body.filters?.uf as string | undefined,
      segment: body.filters?.segment as string | undefined,
      product_id: body.filters?.product_id ? Number(body.filters.product_id) : undefined,
      bdr_user_id: body.filters?.bdr_user_id ? Number(body.filters.bdr_user_id) : undefined,
      phone_availability: (body.filters?.phone_availability as "" | "mobile" | "landline" | "none") ?? "",
      search: body.filters?.search as string | undefined
    });
  }

  clientIds = [...new Set(clientIds.filter((id) => Number.isInteger(id)))];
  if (!clientIds.length) {
    return Response.json({ error: "Nenhum cliente selecionado" }, { status: 400 });
  }

  const fromRows = await run(
    `
      INSERT INTO bdr_transfer_logs (from_bdr_user_id, to_bdr_user_id, transferred_by_user_id, client_count, created_at)
      VALUES (@fromBdr, @toBdr, @byUser, @count, @createdAt)
    `,
    {
      fromBdr: null,
      toBdr: body.to_bdr_user_id,
      byUser: user.id,
      count: clientIds.length,
      createdAt: nowIso()
    }
  );

  const logId = fromRows.lastInsertRowid;
  for (const clientId of clientIds) {
    await run("UPDATE clients SET bdr_user_id = @toBdr, updated_at = @updatedAt WHERE id = @id", {
      toBdr: body.to_bdr_user_id,
      updatedAt: nowIso(),
      id: clientId
    });
    if (logId) {
      await run("INSERT INTO bdr_transfer_log_clients (log_id, client_id) VALUES (@logId, @clientId)", {
        logId,
        clientId
      });
    }
  }

  const followUpsMoved = await reassignPendingFollowUpsForClients(clientIds, body.to_bdr_user_id);

  return Response.json({
    updated: clientIds.length,
    follow_ups_reassigned: followUpsMoved,
    to_bdr_user_id: body.to_bdr_user_id
  });
}
