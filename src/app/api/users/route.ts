import { hashPassword, jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { nowIso, run } from "@/lib/db";
import { listUsers, setUserRoles } from "@/lib/users";
import { userCreateSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const users = await listUsers(false);
  return Response.json({ users });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
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
    return Response.json({ id: userId }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error && e.message.includes("unique") ? "E-mail já cadastrado" : "Erro ao salvar";
    return Response.json({ error: message }, { status: 400 });
  }
}
