import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, nowIso, run } from "@/lib/db";
import { parseContactProfileTags } from "@/lib/script-flow-capture-contact-utils";
import { contactSchema } from "@/lib/validators";
import { syncClientPhonesFromContacts } from "@/lib/call-strategy/client-phones";
import { tryReenterProspeccaoAfterNewPhone } from "@/lib/call-strategy/queue-eval";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const body = await request.json();
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const contactId = Number(id);
  const existing = await get<{ client_id: number; verification_status: string; profile_tags: unknown }>(
    "SELECT client_id, verification_status, profile_tags FROM contacts WHERE id = @id",
    { id: contactId }
  );
  if (!existing) return Response.json({ error: "Não encontrado" }, { status: 404 });

  const profileTags =
    data.profile_tags != null
      ? JSON.stringify(data.profile_tags.map((t) => t.trim()).filter(Boolean))
      : JSON.stringify(parseContactProfileTags(existing.profile_tags));

  await run(
    `
      UPDATE contacts SET
        name = @name,
        job_title = @jobTitle,
        phone = @phone,
        whatsapp = @whatsapp,
        email = @email,
        notes = @notes,
        verification_status = @status,
        profile_tags = @profileTags::jsonb,
        updated_at = @updatedAt
      WHERE id = @id
    `,
    {
      id: contactId,
      name: data.name,
      jobTitle: data.job_title ?? null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? null,
      email: data.email || null,
      notes: data.notes ?? null,
      status: data.verification_status,
      profileTags,
      updatedAt: nowIso()
    }
  );

  if (existing.verification_status !== data.verification_status) {
    await run(
      `
        INSERT INTO contact_verification_logs (contact_id, client_id, old_status, new_status, user_id, created_at)
        VALUES (@contactId, @clientId, @oldStatus, @newStatus, @userId, @createdAt)
      `,
      {
        contactId,
        clientId: existing.client_id,
        oldStatus: existing.verification_status,
        newStatus: data.verification_status,
        userId: user.id,
        createdAt: nowIso()
      }
    );
  }

  await syncClientPhonesFromContacts(existing.client_id);
  await tryReenterProspeccaoAfterNewPhone(existing.client_id);
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  await run("DELETE FROM contacts WHERE id = @id", { id: Number(id) });
  return Response.json({ ok: true });
}
