import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import {
  deleteProspeccaoPriorityType,
  getProspeccaoPriorityTypeById
} from "@/lib/prospeccao-priority-types-repo";
import { canDeletePriority } from "@/lib/prospeccao-priority-queue-admin";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const row = await getProspeccaoPriorityTypeById(id);
  if (!row) return Response.json({ error: "Prioridade não encontrada" }, { status: 404 });

  const full = await listProspeccaoPriorityTypes().then((rows) => rows.find((r) => r.id === id));
  if (!full || !canDeletePriority(full)) {
    return Response.json(
      { error: "Esta prioridade é fixa ou de sistema e não pode ser excluída." },
      { status: 403 }
    );
  }

  await deleteProspeccaoPriorityType(id);
  return Response.json({ items: await listProspeccaoPriorityTypes() });
}
