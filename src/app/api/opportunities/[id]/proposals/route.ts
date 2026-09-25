import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { addProposalVersion } from "@/lib/opportunity-proposals";
import { get } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const opportunityId = Number(id);
  const product = await get<{ uses_proposal: boolean }>(
    `
      SELECT p.uses_proposal FROM opportunities o JOIN products p ON p.id = o.product_id WHERE o.id = @id
    `,
    { id: opportunityId }
  );
  if (!product?.uses_proposal) {
    return Response.json({ error: "Este produto não utiliza proposta." }, { status: 400 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Arquivo obrigatório" }, { status: 400 });
  }
  const proposedValue = form.get("proposed_value");
  const validUntil = form.get("valid_until");
  const notes = form.get("notes");
  try {
    const result = await addProposalVersion({
      opportunity_id: opportunityId,
      file,
      user_id: user.id,
      proposed_value: proposedValue ? Number(proposedValue) : null,
      valid_until: typeof validUntil === "string" && validUntil ? validUntil : null,
      notes: typeof notes === "string" ? notes : null
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha no upload" }, { status: 400 });
  }
}
