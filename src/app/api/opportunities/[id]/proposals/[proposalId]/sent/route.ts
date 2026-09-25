import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { markProposalSent } from "@/lib/opportunity-proposals";
import { proposalSentSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string; proposalId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id, proposalId } = await params;
  const parsed = proposalSentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  await markProposalSent({
    proposal_id: Number(proposalId),
    opportunity_id: Number(id),
    sent_at: parsed.data.sent_at,
    sent_channel: parsed.data.sent_channel,
    user_id: user.id
  });
  return Response.json({ ok: true });
}
