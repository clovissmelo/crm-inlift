import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, get, nowIso, run } from "@/lib/db";
import type { User, UserRole } from "@/lib/types";

const SESSION_COOKIE = "crm_inlift_session";
const SESSION_DAYS = 14;

type SessionUserRow = {
  user_id: number;
  name: string;
  email: string;
  phone: string | null;
  photo_path: string | null;
  status: "active" | "inactive";
  created_at: string;
  last_access_at: string | null;
  expires_at: string;
};

async function loadUserRoles(userId: number): Promise<UserRole[]> {
  const rows = await all<{ role: UserRole }>("SELECT role FROM user_roles WHERE user_id = @userId", { userId });
  return rows.map((r) => r.role);
}

function rowToUser(row: Omit<SessionUserRow, "expires_at">, roles: UserRole[]): User {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    photo_path: row.photo_path,
    status: row.status,
    roles,
    created_at: row.created_at,
    last_access_at: row.last_access_at
  };
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await run(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES (@userId, @token, @expiresAt)`,
    { userId, token, expiresAt }
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt)
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await run("DELETE FROM sessions WHERE token = @token", { token });
  }
  cookieStore.delete(SESSION_COOKIE);
}

async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await get<SessionUserRow>(
    `
      SELECT
        users.id AS user_id,
        users.name,
        users.email,
        users.phone,
        users.photo_path,
        users.status,
        users.created_at,
        users.last_access_at,
        sessions.expires_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = @token
    `,
    { token }
  );

  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await run("DELETE FROM sessions WHERE token = @token", { token });
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }
  if (session.status !== "active") {
    await run("DELETE FROM sessions WHERE token = @token", { token });
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  const roles = await loadUserRoles(session.user_id);
  return rowToUser(session, roles);
}

export async function getCurrentUser() {
  return getSessionUser();
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function loginWithPassword(email: string, password: string) {
  const row = await get<{ id: number; password_hash: string; status: string }>(
    "SELECT id, password_hash, status FROM users WHERE lower(email) = lower(@email)",
    { email: email.trim() }
  );
  if (!row) return { ok: false as const, error: "Credenciais inválidas" };
  if (row.status !== "active") return { ok: false as const, error: "Usuário inativo." };
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return { ok: false as const, error: "Credenciais inválidas" };
  await run("UPDATE users SET last_access_at = @at WHERE id = @id", { at: nowIso(), id: row.id });
  await createSession(row.id);
  return { ok: true as const };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function requireApiUser() {
  return getSessionUser();
}

export function jsonUnauthorized() {
  return Response.json({ error: "Não autenticado" }, { status: 401 });
}
