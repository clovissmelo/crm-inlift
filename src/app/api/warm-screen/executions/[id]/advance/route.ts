import { requireWarmScreenApiUser } from "@/lib/warm-screen/api-auth";
import { getExecutionById } from "@/lib/warm-screen/executions";
import { advanceWarmScreenExecution } from "@/lib/warm-screen/advance";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  const id = Number((await context.params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const exec = await getExecutionById(id);
  if (!exec || exec.runner_user_id !== user!.id) {
    return Response.json({ error: "Execução não encontrada." }, { status: 404 });
  }

  const result = await advanceWarmScreenExecution(id);
  return Response.json(result);
}
