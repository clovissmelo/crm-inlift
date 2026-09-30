import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  contact_outcome_type_id: z.number().int().positive(),
  commercial_result_type_ids: z.array(z.number().int().positive())
});

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const { contact_outcome_type_id, commercial_result_type_ids } = parsed.data;
  await run("DELETE FROM contact_commercial_compat WHERE contact_outcome_type_id = @id", {
    id: contact_outcome_type_id
  });
  for (const commercialId of commercial_result_type_ids) {
    await run(
      `
        INSERT INTO contact_commercial_compat (contact_outcome_type_id, commercial_result_type_id)
        VALUES (@contactId, @commercialId)
        ON CONFLICT DO NOTHING
      `,
      { contactId: contact_outcome_type_id, commercialId }
    );
  }
  return Response.json({ ok: true });
}
