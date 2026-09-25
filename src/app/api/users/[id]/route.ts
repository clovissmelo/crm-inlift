import { hashPassword, jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { getUserById, setUserRoles } from "@/lib/users";
import { userUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const found = await getUserById(Number(id));
  if (!found) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return Response.json({ user: found });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const userId = Number(id);
  const body = await request.json();
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const existing = await get<{ id: number }>("SELECT id FROM users WHERE id = @id", { id: userId });
  if (!existing) return Response.json({ error: "Não encontrado" }, { status: 404 });

  if (data.name) await run("UPDATE users SET name = @name WHERE id = @id", { name: data.name, id: userId });
  if (data.email) await run("UPDATE users SET email = @email WHERE id = @id", { email: data.email, id: userId });
  if (data.phone !== undefined) await run("UPDATE users SET phone = @phone WHERE id = @id", { phone: data.phone ?? null, id: userId });
  if (data.status) await run("UPDATE users SET status = @status WHERE id = @id", { status: data.status, id: userId });
  if (data.password) {
    const passwordHash = await hashPassword(data.password);
    await run("UPDATE users SET password_hash = @passwordHash WHERE id = @id", { passwordHash, id: userId });
  }
  if (data.roles) await setUserRoles(userId, data.roles);

  const updated = await getUserById(userId);
  return Response.json({ user: updated });
}
