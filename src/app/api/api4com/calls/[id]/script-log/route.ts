import { appendCallScriptLog, replaceCallScriptLog } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  step_id: z.string().min(1),
  step_title: z.string().min(1),
  action: z.enum(["next", "choice", "restart", "capture"]),
  choice_label: z.string().optional().nullable(),
  next_step_id: z.string().optional().nullable(),
  capture_notes: z
    .array(z.object({ label: z.string(), value: z.string(), field_key: z.string().optional() }))
    .optional(),
  contact_layer: z.enum(["decisor", "outra", "ninguem"]).optional(),
  scheduled_meeting_at: z.string().optional().nullable(),
  scheduled_return_at: z.string().optional().nullable(),
  created_contact_id: z.number().int().positive().optional()
});

const logEntrySchema = z.object({
  at: z.string(),
  step_id: z.string(),
  step_title: z.string(),
  action: z.enum(["next", "choice", "restart", "capture"]),
  choice_label: z.string().optional().nullable(),
  next_step_id: z.string().optional().nullable(),
  capture_notes: z
    .array(z.object({ label: z.string(), value: z.string(), field_key: z.string().optional() }))
    .optional(),
  contact_layer: z.enum(["decisor", "outra", "ninguem"]).optional(),
  scheduled_meeting_at: z.string().optional().nullable(),
  scheduled_return_at: z.string().optional().nullable(),
  created_contact_id: z.number().int().positive().optional()
});

const replaceBodySchema = z.object({
  log: z.array(logEntrySchema)
});

export async function PUT(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const callId = Number(id);
  if (!Number.isFinite(callId)) {
    return Response.json({ error: "Chamada inválida" }, { status: 400 });
  }
  const parsed = replaceBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const log = await replaceCallScriptLog(callId, user.id, parsed.data.log);
    return Response.json({ log });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao atualizar roteiro" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const callId = Number(id);
  if (!Number.isFinite(callId)) {
    return Response.json({ error: "Chamada inválida" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const log = await appendCallScriptLog(callId, user.id, parsed.data);
    const last = log[log.length - 1];
    const contactCreated =
      last?.created_contact_id != null
        ? { id: last.created_contact_id, step_id: last.step_id }
        : undefined;
    return Response.json({ log, contact_created: contactCreated });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao registrar roteiro" }, { status: 400 });
  }
}
