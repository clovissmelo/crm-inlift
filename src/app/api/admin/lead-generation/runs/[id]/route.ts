import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { getLeadGenerationRun, listRunItems } from "@/lib/lead-generation/runs-repo";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const run = await getLeadGenerationRun(id);
  if (!run) return Response.json({ error: "Execução não encontrada" }, { status: 404 });

  const tab = new URL(_request.url).searchParams.get("tab");
  let items: Record<string, unknown>[] | undefined;
  if (tab === "created") items = await listRunItems(id, "created");
  else if (tab === "existing") items = await listRunItems(id, "existing");
  else if (tab === "ambiguous") items = await listRunItems(id, "ambiguous");
  else if (tab === "errors") {
    const err = await listRunItems(id, "error");
    const ng = await listRunItems(id, "no_google_match");
    items = [...err, ...ng];
  }

  return Response.json({ run, items });
}
