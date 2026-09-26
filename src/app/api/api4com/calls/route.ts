import { initiateApi4comCall } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { api4comStartCallSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  if (!user.roles.includes("bdr") && !user.roles.includes("admin")) {
    return Response.json({ error: "Apenas BDRs podem iniciar ligações API4COM." }, { status: 403 });
  }

  const parsed = api4comStartCallSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  try {
    const result = await initiateApi4comCall({
      userId: user.id,
      clientId: parsed.data.client_id,
      contactId: parsed.data.contact_id,
      productId: parsed.data.product_id,
      phone: parsed.data.phone,
      dialSessionRootId: parsed.data.dial_session_root_id
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao discar" }, { status: 400 });
  }
}
