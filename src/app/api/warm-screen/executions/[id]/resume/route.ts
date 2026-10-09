import { requireWarmScreenApiUser } from "@/lib/warm-screen/api-auth";
import { getExecutionById, resumeExecution } from "@/lib/warm-screen/executions";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  const id = Number((await context.params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const exec = await getExecutionById(id);
  if (!exec || exec.runner_user_id !== user!.id) {
    return Response.json({ error: "Execução não encontrada." }, { status: 404 });
  }

  try {
    await resumeExecution(id, user!.id);
    return Response.json({ ok: true, execution: await getExecutionById(id) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
