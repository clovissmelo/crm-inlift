import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, nowIso, run } from "@/lib/db";
import { contactSchema } from "@/lib/validators";

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
  const result = await run(
    `
      INSERT INTO contacts (client_id, name, job_title, phone, whatsapp, email, notes, verification_status, created_at, updated_at)
      VALUES (@clientId, @name, @jobTitle, @phone, @whatsapp, @email, @notes, @status, @createdAt, @updatedAt)
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
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  );
  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
