import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { get, run, nowIso } from "@/lib/db";
import { previewClientReconsult } from "@/lib/lead-discovery";
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

const applySchema = z.object({
  apply: z.array(
    z.object({
      field: z.enum(["phone", "whatsapp", "website", "instagram", "email", "address"]),
      action: z.enum(["add_contact", "replace_client", "replace_contact"]),
      contact_id: z.number().int().positive().optional(),
      value: z.string().min(1)
    })
  )
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

  const client = await get<{ id: number; website: string | null; instagram: string | null }>(
    "SELECT id, website, instagram FROM clients WHERE id = @id",
    { id: clientId }
  );
  if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });

  for (const item of parsed.data.apply) {
    if (item.field === "website" && item.action === "replace_client") {
      await run("UPDATE clients SET website = @v, updated_at = @now WHERE id = @id", {
        v: item.value,
        now: nowIso(),
        id: clientId
      });
    } else if (item.field === "instagram" && item.action === "replace_client") {
      await run("UPDATE clients SET instagram = @v, updated_at = @now WHERE id = @id", {
        v: item.value,
        now: nowIso(),
        id: clientId
      });
    } else if (item.action === "add_contact" && (item.field === "phone" || item.field === "whatsapp")) {
      await run(
        `
          INSERT INTO contacts (client_id, name, phone, whatsapp, verification_status, created_at, updated_at)
          VALUES (@clientId, @name, @phone, @whatsapp, 'unverified', @now, @now)
        `,
        {
          clientId,
          name: "Contato (reconsulta)",
          phone: item.field === "phone" ? item.value : null,
          whatsapp: item.field === "whatsapp" ? item.value : null,
          now: nowIso()
        }
      );
    } else if (item.contact_id && item.action === "replace_contact") {
      const col = item.field === "phone" ? "phone" : item.field === "whatsapp" ? "whatsapp" : item.field === "email" ? "email" : null;
      if (col) {
        await run(`UPDATE contacts SET ${col} = @v, updated_at = @now WHERE id = @cid AND client_id = @clientId`, {
          v: item.value,
          now: nowIso(),
          cid: item.contact_id,
          clientId
        });
      }
    }
  }

  return Response.json({ ok: true, applied: parsed.data.apply.length });
}
