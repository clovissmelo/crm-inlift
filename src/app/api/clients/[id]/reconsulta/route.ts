import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { get, run, nowIso } from "@/lib/db";
import { previewClientReconsult, type ReconsultApplyOp } from "@/lib/lead-discovery";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const clientId = Number(id);
  const client = await get<{ id: number }>("SELECT id FROM clients WHERE id = @id", { id: clientId });
  if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
  const preview = await previewClientReconsult(clientId);
  return Response.json(preview);
}

const applyOpSchema: z.ZodType<ReconsultApplyOp> = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set_client"),
    field: z.enum([
      "trade_name",
      "legal_name",
      "address",
      "website",
      "google_place_id",
      "anp_fuel_brand",
      "anp_products_summary"
    ]),
    value: z.string()
  }),
  z.object({
    op: z.literal("set_client_bool"),
    field: z.literal("anp_white_flag"),
    value: z.boolean()
  }),
  z.object({
    op: z.literal("add_contact"),
    name: z.string().min(1),
    phone: z.string().nullable(),
    job_title: z.string().nullable(),
    origin: z.string().min(1)
  })
]);

const applySchema = z.object({
  apply: z.array(applyOpSchema)
});

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const clientId = Number(id);
  const parsed = applySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const client = await get<{ id: number }>("SELECT id FROM clients WHERE id = @id", { id: clientId });
  if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });

  const clientStringFields = new Set([
    "trade_name",
    "legal_name",
    "address",
    "website",
    "google_place_id",
    "anp_fuel_brand",
    "anp_products_summary"
  ]);

  for (const item of parsed.data.apply) {
    if (item.op === "set_client" && clientStringFields.has(item.field)) {
      await run(`UPDATE clients SET ${item.field} = @v, updated_at = @now WHERE id = @id`, {
        v: item.value,
        now: nowIso(),
        id: clientId
      });
    } else if (item.op === "set_client_bool" && item.field === "anp_white_flag") {
      await run("UPDATE clients SET anp_white_flag = @v, updated_at = @now WHERE id = @id", {
        v: item.value,
        now: nowIso(),
        id: clientId
      });
    } else if (item.op === "add_contact") {
      await run(
        `
          INSERT INTO contacts (
            client_id, name, job_title, phone, verification_status, origin, created_at, updated_at
          )
          VALUES (
            @clientId, @name, @jobTitle, @phone, 'unverified', @origin, @now, @now
          )
        `,
        {
          clientId,
          name: item.name.slice(0, 200),
          jobTitle: item.job_title,
          phone: item.phone,
          origin: item.origin,
          now: nowIso()
        }
      );
    }
  }

  return Response.json({ ok: true, applied: parsed.data.apply.length });
}
