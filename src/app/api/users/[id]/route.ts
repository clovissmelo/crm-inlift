import { deleteBlockedMessage, requireAdminApi } from "@/lib/admin";
import { hashPassword, jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { applyUserApi4comExtension } from "@/lib/api4com/user-extension";
import { applyUserApi4comApiToken } from "@/lib/api4com/user-token";
import { deleteUser, getUserById, setUserRoles } from "@/lib/users";
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
  if (userId !== user.id) {
    const denied = requireAdminApi(user);
    if (denied) return denied;
  }
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
  let roles = (await getUserById(userId))?.roles ?? [];
  if (data.roles) {
    await setUserRoles(userId, data.roles);
    roles = data.roles;
  }
  if (data.api4com_extension !== undefined) {
    try {
      await applyUserApi4comExtension(userId, roles, data.api4com_extension);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Ramal inválido" }, { status: 400 });
    }
  } else if (data.roles) {
    await applyUserApi4comExtension(userId, roles, undefined);
  }
  if (data.clear_api4com_api_token) {
    await applyUserApi4comApiToken(userId, roles, null, { clear: true });
  } else if (data.api4com_api_token) {
    await applyUserApi4comApiToken(userId, roles, data.api4com_api_token);
  } else if (data.roles && !data.roles.includes("bdr")) {
    await applyUserApi4comApiToken(userId, data.roles, null, { clear: true });
  }

  const updated = await getUserById(userId);
  return Response.json({ user: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const userId = Number(id);
  if (userId === user.id) {
    return Response.json({ error: "Você não pode excluir seu próprio usuário." }, { status: 400 });
  }
  const existing = await getUserById(userId);
  if (!existing) return Response.json({ error: "Não encontrado" }, { status: 404 });
  try {
    await deleteUser(userId);
  } catch (err) {
    return Response.json({ error: deleteBlockedMessage(err) }, { status: 409 });
  }
  return Response.json({ ok: true });
}
