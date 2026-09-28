import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { getLeadGenerationRun, resumeRun } from "@/lib/lead-generation/runs-repo";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  const run = await getLeadGenerationRun(id);
  if (!run) return Response.json({ error: "Não encontrado" }, { status: 404 });
  if (run.status !== "paused") {
    return Response.json({ error: "Só é possível retomar execuções pausadas." }, { status: 400 });
  }
  await resumeRun(id);
  return Response.json({ ok: true });
}
