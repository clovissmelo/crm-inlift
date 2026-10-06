import { requireWarmScreenApiUser } from "@/lib/warm-screen/api-auth";
import { getRunningExecutionForRunner, listExecutionItems } from "@/lib/warm-screen/executions";
import { advanceWarmScreenExecution } from "@/lib/warm-screen/advance";

export async function GET(request: Request) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  const url = new URL(request.url);
  const tick = url.searchParams.get("tick") === "1";

  const execution = await getRunningExecutionForRunner(user!.id);
  if (!execution) {
    return Response.json({ execution: null, items: [] });
  }

  if (tick && execution.status === "running") {
    await advanceWarmScreenExecution(execution.id);
  }

  const { getExecutionById } = await import("@/lib/warm-screen/executions");
  const fresh = await getExecutionById(execution.id);
  const items = fresh ? await listExecutionItems(fresh.id) : [];

  return Response.json({ execution: fresh, items });
}
