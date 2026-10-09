import { z } from "zod";
import { assertDialIdentityAllowed } from "@/lib/api4com/dial-identity";
import { isManagerOrAdmin, requireWarmScreenApiUser } from "@/lib/warm-screen/api-auth";
import { canWarmScreenLeadsForBdr } from "@/lib/warm-screen/permissions";
import {
  listExecutionsForViewer,
  startWarmScreenExecution
} from "@/lib/warm-screen/executions";
const startSchema = z.object({
  dial_as_user_id: z.number().int().positive().optional(),
  dial_mode: z.enum(["silent", "assisted"]).optional(),
  filters: z
    .object({
      prioridade: z.string().optional(),
      product_id: z.number().int().positive().optional(),
      company_id: z.number().int().positive().optional(),
      bdr_user_id: z.number().int().positive().optional(),
      search: z.string().optional()
    })
    .optional()
});

export async function GET(request: Request) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 30;
  const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;

  const items = await listExecutionsForViewer({
    viewerUserId: user!.id,
    isManagerOrAdmin: isManagerOrAdmin(user!),
    limit,
    offset
  });

  return Response.json({ items });
}

export async function POST(request: Request) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  const parsed = startSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const dialUserId = parsed.data.dial_as_user_id ?? user!.id;
  await assertDialIdentityAllowed({
    sessionUserId: user!.id,
    isAdmin: user!.roles.includes("admin"),
    dialIdentityUserId: dialUserId
  });

  const filters = parsed.data.filters ?? {};
  if (filters.bdr_user_id && !canWarmScreenLeadsForBdr(user!, filters.bdr_user_id)) {
    return Response.json({ error: "Sem permissão para aquecer leads desta BDR." }, { status: 403 });
  }

  if (!isManagerOrAdmin(user!) && user!.roles.includes("bdr")) {
    filters.bdr_user_id = user!.id;
  }

  try {
    const execution = await startWarmScreenExecution({
      runnerUserId: user!.id,
      dialUserId,
      dialMode: parsed.data.dial_mode ?? "silent",
      filters: {
        ...filters,
        exclude_warm_screen_confirmed: true,
        limit: 5000,
        offset: 0
      }
    });
    if (!execution) {
      return Response.json({ error: "Falha ao criar execução." }, { status: 500 });
    }
    // Primeira discagem via poll do cliente (tick=1) — após prepareForApiDial + beginDialAssist no navegador.
    return Response.json({ execution }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao iniciar" }, { status: 400 });
  }
}
