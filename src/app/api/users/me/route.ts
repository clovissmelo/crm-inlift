import { hashPassword, jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { applyUserApi4comExtension } from "@/lib/api4com/user-extension";
import { applyUserApi4comApiToken } from "@/lib/api4com/user-token";
import { getUserById } from "@/lib/users";
import { profileUpdateSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const full = await getUserById(user.id);
  return Response.json({ user: full ?? user });
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

  if (data.api4com_extension !== undefined || data.api4com_api_token !== undefined || data.clear_api4com_api_token) {
    if (!user.roles.includes("bdr")) {
      return Response.json({ error: "Configuração API4COM disponível apenas para perfil BDR." }, { status: 400 });
    }
  }
  if (data.api4com_extension !== undefined) {
    try {
      await applyUserApi4comExtension(user.id, user.roles, data.api4com_extension);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Ramal inválido" }, { status: 400 });
    }
  }
  if (data.clear_api4com_api_token) {
    await applyUserApi4comApiToken(user.id, user.roles, null, { clear: true });
  } else if (data.api4com_api_token !== undefined && data.api4com_api_token !== null) {
    await applyUserApi4comApiToken(user.id, user.roles, data.api4com_api_token);
  }

  const updated = await getUserById(user.id);
  return Response.json({ user: updated });
}
