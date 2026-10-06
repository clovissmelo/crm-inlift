import { requireWarmScreenApiUser, isManagerOrAdmin } from "@/lib/warm-screen/api-auth";
import { canViewWarmScreenExecution } from "@/lib/warm-screen/permissions";
import { getExecutionById, listExecutionItems } from "@/lib/warm-screen/executions";

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

  const items = await listExecutionItems(id);
  return Response.json({ execution, items });
}
