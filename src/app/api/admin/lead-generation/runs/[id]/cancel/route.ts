import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import {
  cancelLeadGenerationRun,
  finalizeCancelledRun,
  getLeadGenerationRun
} from "@/lib/lead-generation/runs-repo";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  const result = await cancelLeadGenerationRun(id);
  if (!result.ok) {
    const status = result.error === "Não encontrado" ? 404 : 400;
    return Response.json({ error: result.error }, { status });
  }

  if (result.drain) {
    await drainLeadGenerationTicks({ runId: id, maxTicks: 4, maxMs: 12_000 });
    const after = await getLeadGenerationRun(id);
    if (after && after.cancel_requested && after.status === "running") {
      await finalizeCancelledRun(id);
    }
  }

  const run = await getLeadGenerationRun(id);
  return Response.json({ ok: true, run });
}
