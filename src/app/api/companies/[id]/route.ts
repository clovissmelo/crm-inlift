import { deleteBlockedMessage, requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { deleteCompany, getCompany, saveCompany } from "@/lib/companies";
import { companySchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const company = await getCompany(Number(id));
  if (!company) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return Response.json({ company });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const body = await request.json();
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const companyId = await saveCompany({ ...parsed.data, id: Number(id) });
  const company = await getCompany(companyId);
  return Response.json({ company });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const companyId = Number(id);
  const company = await getCompany(companyId);
  if (!company) return Response.json({ error: "Não encontrado" }, { status: 404 });
  try {
    await deleteCompany(companyId);
  } catch (err) {
    return Response.json({ error: deleteBlockedMessage(err) }, { status: 409 });
  }
  return Response.json({ ok: true });
}
