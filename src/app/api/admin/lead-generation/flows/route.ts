import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { FLOW_STEP_CATALOG, FLOW_STEP_KEYS } from "@/lib/lead-generation/flow-modules";
import {
  buildFlowSnapshot,
  getLeadGenerationFlow,
  listLeadGenerationFlows,
  saveFlowMeta,
  saveFlowSteps,
  type FlowStepRow
} from "@/lib/lead-generation/flows-repo";
import { isFlowStepKey } from "@/lib/lead-generation/flow-modules";
import { z } from "zod";

const stepPatchSchema = z.object({
  step_key: z.string(),
  sort_order: z.number().int().min(0).max(9999),
  enabled: z.boolean(),
  on_fail: z.enum(["continue", "stop"]),
  max_api_calls: z.number().int().min(0).max(9999).nullable().optional()
});

const patchSchema = z.object({
  flow_id: z.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  active: z.boolean().optional(),
  steps: z.array(stepPatchSchema).optional()
});

export async function GET(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const url = new URL(request.url);
  const segment = url.searchParams.get("segment")?.trim();
  const flowIdParam = url.searchParams.get("flow_id");

  if (segment) {
    const { getDefaultFlowForSegment } = await import("@/lib/lead-generation/flows-repo");
    const flow = await getDefaultFlowForSegment(segment);
    if (!flow) return Response.json({ error: "Fluxo não encontrado" }, { status: 404 });
    return Response.json({ flow, snapshot: buildFlowSnapshot(flow), catalog: FLOW_STEP_CATALOG });
  }

  if (flowIdParam) {
    const flow = await getLeadGenerationFlow(Number(flowIdParam));
    if (!flow) return Response.json({ error: "Fluxo não encontrado" }, { status: 404 });
    return Response.json({ flow, snapshot: buildFlowSnapshot(flow), catalog: FLOW_STEP_CATALOG });
  }

  const flows = await listLeadGenerationFlows();
  return Response.json({
    flows,
    step_keys: FLOW_STEP_KEYS,
    catalog: FLOW_STEP_CATALOG
  });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const existing = await getLeadGenerationFlow(parsed.data.flow_id);
  if (!existing) return Response.json({ error: "Fluxo não encontrado" }, { status: 404 });

  await saveFlowMeta(parsed.data.flow_id, {
    name: parsed.data.name,
    description: parsed.data.description,
    active: parsed.data.active
  });

  if (parsed.data.steps) {
    const merged: FlowStepRow[] = existing.steps.map((s) => {
      const patch = parsed.data.steps!.find((p) => p.step_key === s.step_key);
      if (!patch || !isFlowStepKey(patch.step_key)) return s;
      return {
        ...s,
        sort_order: patch.sort_order,
        enabled: patch.enabled,
        on_fail: patch.on_fail,
        max_api_calls: patch.max_api_calls ?? null
      };
    });
    await saveFlowSteps(parsed.data.flow_id, merged);
  }

  const flow = await getLeadGenerationFlow(parsed.data.flow_id);
  return Response.json({ flow, snapshot: flow ? buildFlowSnapshot(flow) : null });
}
