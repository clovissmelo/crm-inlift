import fs from "node:fs";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getProposalFile } from "@/lib/opportunity-proposals";

type Params = { params: Promise<{ id: string; proposalId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id, proposalId } = await params;
  const file = await getProposalFile(Number(proposalId), Number(id));
  if (!file) return Response.json({ error: "Não encontrado" }, { status: 404 });
  const stream = fs.createReadStream(file.absPath);
  return new Response(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`
    }
  });
}
