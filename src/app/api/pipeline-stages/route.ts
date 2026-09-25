import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listPipelineStages, upsertPipelineStage } from "@/lib/pipeline-stages";
import { pipelineStageSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const all = new URL(request.url).searchParams.get("all") === "1";
  const stages = await listPipelineStages(!all);
  return Response.json({ items: stages });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const parsed = pipelineStageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const id = await upsertPipelineStage(parsed.data);
  return Response.json({ id });
}
