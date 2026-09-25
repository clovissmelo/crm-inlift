import { hashPassword, jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { getUserById } from "@/lib/users";
import { profileUpdateSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  return Response.json({ user });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = await request.json();
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;

  if (data.new_password) {
    if (!data.current_password) {
      return Response.json({ error: "Informe a senha atual" }, { status: 400 });
    }
    const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = @id", { id: user.id });
    if (!row) return jsonUnauthorized();
    const bcrypt = await import("bcryptjs");
    const ok = await bcrypt.compare(data.current_password, row.password_hash);
    if (!ok) return Response.json({ error: "Senha atual incorreta" }, { status: 400 });
    const passwordHash = await hashPassword(data.new_password);
    await run("UPDATE users SET password_hash = @passwordHash WHERE id = @id", { passwordHash, id: user.id });
  }

  if (data.name) await run("UPDATE users SET name = @name WHERE id = @id", { name: data.name, id: user.id });
  if (data.email) await run("UPDATE users SET email = @email WHERE id = @id", { email: data.email, id: user.id });
  if (data.phone !== undefined) await run("UPDATE users SET phone = @phone WHERE id = @id", { phone: data.phone ?? null, id: user.id });

  const updated = await getUserById(user.id);
  return Response.json({ user: updated });
}
