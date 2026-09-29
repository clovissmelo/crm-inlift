import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { LEAD_GEN_FILTER_KINDS, listLeadGenSegments, saveLeadGenSegments } from "@/lib/lead-generation/segments-repo";
import type { LeadGenSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { z } from "zod";

const itemSchema = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  filter_kind: z.enum(["all", "branded", "white_flag", "distributor", "trr"]),
  sort_order: z.number().int().min(0).max(9999),
  active: z.boolean(),
  default_flow_id: z.number().int().positive().nullable().optional()
});

const patchSchema = z.object({
  segments: z.array(itemSchema).min(1).max(40)
});

export async function GET(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const activeOnly = new URL(request.url).searchParams.get("active") === "1";
  const segments = await listLeadGenSegments({ activeOnly });
  return Response.json({
    segments,
    filter_kinds: LEAD_GEN_FILTER_KINDS.map((k) => ({
      value: k,
      label:
        k === "all"
          ? "Todos (sem filtro ANP)"
          : k === "branded"
            ? "Bandeirado"
            : k === "white_flag"
              ? "Bandeira branca"
              : k === "distributor"
                ? "Distribuidora"
                : "TRR"
    }))
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

  await saveLeadGenSegments(parsed.data.segments as Array<{
    slug: string;
    label: string;
    filter_kind: LeadGenSegmentFilter;
    sort_order: number;
    active: boolean;
    default_flow_id?: number | null;
  }>);

  const segments = await listLeadGenSegments();
  return Response.json({ segments });
}
