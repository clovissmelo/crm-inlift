import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import {
  countOpportunitiesInStage,
  deletePipelineStage,
  getPipelineStage,
  upsertPipelineStage
} from "@/lib/pipeline-stages";
import { pipelineStageDeleteSchema, pipelineStageSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

function deleteErrorMessage(code: string) {
  switch (code) {
    case "NOT_FOUND":
      return "Etapa não encontrada.";
    case "REASSIGN_REQUIRED":
      return "Selecione para qual etapa mover os negócios desta etapa.";
    case "INVALID_TARGET":
      return "Etapa de destino inválida ou inativa.";
    case "REASSIGN_MUST_BE_IN_PROGRESS":
      return "Os negócios só podem ser movidos para uma etapa em andamento.";
    default:
      return "Não foi possível excluir a etapa.";
  }
}

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const stageId = Number(id);
  const stage = await getPipelineStage(stageId);
  if (!stage) return Response.json({ error: "Não encontrado" }, { status: 404 });
  const opportunities = await countOpportunitiesInStage(stageId);
  return Response.json({ stage, opportunities });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json();
  const parsed = pipelineStageSchema.safeParse({ ...body, id: Number(id) });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const stageId = await upsertPipelineStage(parsed.data);
  const stage = await getPipelineStage(stageId);
  return Response.json({ stage });
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const stageId = Number(id);
  const body = await request.json().catch(() => ({}));
  const parsed = pipelineStageDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const oppCount = await countOpportunitiesInStage(stageId);
  if (oppCount > 0 && !parsed.data.reassign_to_stage_id) {
    return Response.json({ error: deleteErrorMessage("REASSIGN_REQUIRED"), opportunities: oppCount }, { status: 400 });
  }

  try {
    await deletePipelineStage(stageId, parsed.data.reassign_to_stage_id ?? null, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    return Response.json({ error: deleteErrorMessage(message) }, { status: 400 });
  }

  return Response.json({ ok: true });
}
