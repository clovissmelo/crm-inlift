import { hashPassword, jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { nowIso, run } from "@/lib/db";
import { applyUserApi4comExtension } from "@/lib/api4com/user-extension";
import { applyUserApi4comApiToken } from "@/lib/api4com/user-token";
import { requireAdminApi } from "@/lib/admin";
import { listUsers, setUserRoles } from "@/lib/users";
import { userCreateSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const users = await listUsers(false);
  return Response.json({ users });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const body = await request.json();
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const passwordHash = await hashPassword(data.password);
  try {
    const result = await run(
      `
        INSERT INTO users (name, email, phone, status, password_hash, created_at)
        VALUES (@name, @email, @phone, @status, @passwordHash, @createdAt)
      `,
      {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        status: data.status,
        passwordHash,
        createdAt: nowIso()
      }
    );
    const userId = result.lastInsertRowid;
    if (!userId) throw new Error("Falha ao criar usuário");
    await setUserRoles(userId, data.roles);
    if (data.api4com_extension !== undefined) {
      await applyUserApi4comExtension(userId, data.roles, data.api4com_extension);
    }
    if (data.api4com_api_token) {
      await applyUserApi4comApiToken(userId, data.roles, data.api4com_api_token);
    }
    return Response.json({ id: userId }, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes("unique")) {
        return Response.json({ error: "E-mail já cadastrado" }, { status: 400 });
      }
      if (e.message.includes("ramal") || e.message.includes("Ramal")) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }
    return Response.json({ error: "Erro ao salvar" }, { status: 400 });
  }
}
