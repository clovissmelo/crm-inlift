import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listCompanies, saveCompany } from "@/lib/companies";
import { companySchema } from "@/lib/validators";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const companies = await listCompanies(activeOnly);
  return Response.json({ companies });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = await request.json();
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const id = await saveCompany(parsed.data);
  return Response.json({ id }, { status: 201 });
}
