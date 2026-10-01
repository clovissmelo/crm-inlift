import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { CONTACT_ORIGIN } from "@/lib/contact-origin";
import { all, nowIso, run } from "@/lib/db";
import { contactSchema } from "@/lib/validators";
import { syncClientPhonesFromContacts } from "@/lib/call-strategy/client-phones";
import { tryReenterProspeccaoAfterNewPhone } from "@/lib/call-strategy/queue-eval";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const contacts = await all(
    "SELECT * FROM contacts WHERE client_id = @id ORDER BY is_primary_phone DESC, name",
    { id: Number(id) }
  );
  return Response.json({ contacts });
}

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const clientId = Number(id);
  const body = await request.json();
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const origin = data.origin?.trim() || CONTACT_ORIGIN.manual;
  const result = await run(
    `
      INSERT INTO contacts (
        client_id, name, job_title, phone, whatsapp, email, notes, verification_status, origin, created_at, updated_at
      )
      VALUES (
        @clientId, @name, @jobTitle, @phone, @whatsapp, @email, @notes, @status, @origin, @createdAt, @updatedAt
      )
    `,
    {
      clientId,
      name: data.name,
      jobTitle: data.job_title ?? null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? null,
      email: data.email || null,
      notes: data.notes ?? null,
      status: data.verification_status,
      origin,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  );
  await syncClientPhonesFromContacts(clientId);
  await tryReenterProspeccaoAfterNewPhone(clientId);
  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
