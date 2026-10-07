import { requireWarmScreenApiUser, isManagerOrAdmin } from "@/lib/warm-screen/api-auth";
import { canViewWarmScreenExecution } from "@/lib/warm-screen/permissions";
import {
  deleteWarmScreenExecution,
  getExecutionById,
  listExecutionItemsForRealtime
} from "@/lib/warm-screen/executions";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "ID inválido" }, { status: 400 });
  }

  const execution = await getExecutionById(id);
  if (!execution) {
    return Response.json({ error: "Não encontrada" }, { status: 404 });
  }

  if (
    !canViewWarmScreenExecution(user!, execution) &&
    !isManagerOrAdmin(user!)
  ) {
    return Response.json({ error: "Sem permissão" }, { status: 403 });
  }

  const items = await listExecutionItemsForRealtime(id, execution);
  return Response.json({ execution, items });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  if (!user!.roles.includes("admin")) {
    return Response.json({ error: "Apenas administradores podem excluir execuções." }, { status: 403 });
  }

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    await deleteWarmScreenExecution(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao excluir" }, { status: 400 });
  }
}
