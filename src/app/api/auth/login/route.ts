import { loginWithPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const result = await loginWithPassword(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 401 });
  }
  return Response.json({ ok: true });
}
