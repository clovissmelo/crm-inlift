import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { finalizeLeadGenerationRunNow } from "@/lib/lead-generation/run-processor";
import { getLeadGenerationRun } from "@/lib/lead-generation/runs-repo";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "Execução inválida" }, { status: 400 });
  }

  const result = await finalizeLeadGenerationRunNow(id);
  if (!result.ok) {
    const status = result.error === "Não encontrado" ? 404 : 400;
    return Response.json({ error: result.error }, { status });
  }

  const run = await getLeadGenerationRun(id);
  return Response.json({ ok: true, run });
}
