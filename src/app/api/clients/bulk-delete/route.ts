import { deleteBlockedMessage, requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { deleteClientsByIds } from "@/lib/clients";
import { queryAllMatchingClientIds } from "@/lib/clients-query";
import {
  clientFiltersFromOrganizacaoParams,
  organizacaoFiltersToRecord
} from "@/lib/organizacao-leads-filters";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const body = (await request.json()) as {
    client_ids?: number[];
    select_all?: boolean;
    filters?: Record<string, string>;
    confirm_phrase?: string;
  };

  let clientIds = body.client_ids ?? [];
  if (body.select_all) {
    clientIds = await queryAllMatchingClientIds(
      clientFiltersFromOrganizacaoParams(organizacaoFiltersToRecord(body.filters ?? {}))
    );
  }

  clientIds = [...new Set(clientIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!clientIds.length) {
    return Response.json({ error: "Nenhum lead selecionado" }, { status: 400 });
  }

  const expectedPhrase = `APAGAR ${clientIds.length}`;
  if (body.confirm_phrase?.trim() !== expectedPhrase) {
    return Response.json({ error: "Confirmação inválida." }, { status: 400 });
  }

  const result = await deleteClientsByIds(clientIds);
  if (result.failed.length && result.deleted === 0) {
    return Response.json(
      {
        error: deleteBlockedMessage({ code: "23503" }, result.failed[0]?.error ?? "Não foi possível excluir."),
        deleted: result.deleted,
        failed: result.failed
      },
      { status: 409 }
    );
  }

  return Response.json({
    deleted: result.deleted,
    failed: result.failed,
    requested: result.requested
  });
}
