import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import { getLeadGenerationRun } from "@/lib/lead-generation/runs-repo";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** Avança a execução sem carregar itens (polling leve). */
export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const before = await getLeadGenerationRun(id);
  if (!before) return Response.json({ error: "Execução não encontrada" }, { status: 404 });

  if (["queued", "running"].includes(before.status)) {
    await drainLeadGenerationTicks({ runId: id, maxTicks: 6, maxMs: 50_000 });
  }

  const run = await getLeadGenerationRun(id);
  return Response.json({ run });
}
