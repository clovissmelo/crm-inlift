import { all, get, run } from "@/lib/db";
import type { User, UserRole } from "@/lib/types";

type UserRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  photo_path: string | null;
  status: "active" | "inactive";
  api4com_extension: string | null;
  api4com_api_token: string | null;
  api4com_sip_password: string | null;
  created_at: string;
  last_access_at: string | null;
};

async function attachRoles(users: UserRow[]): Promise<User[]> {
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const roleRows = await all<{ user_id: number; role: UserRole }>(
    `SELECT user_id, role FROM user_roles WHERE user_id IN (${ids.join(",")})`
  );
  const byUser = new Map<number, UserRole[]>();
  for (const r of roleRows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.role);
    byUser.set(r.user_id, list);
  }
  const profileRows = await all<{ user_id: number; profile_id: number }>(
    `SELECT user_id, profile_id FROM user_access_profiles WHERE user_id IN (${ids.join(",")})`
  );
  const profilesByUser = new Map<number, number[]>();
  for (const r of profileRows) {
    const list = profilesByUser.get(r.user_id) ?? [];
    list.push(Number(r.profile_id));
    profilesByUser.set(r.user_id, list);
  }
  return users.map((u) =>
    sanitizeUserForClient({
      ...u,
      roles: byUser.get(u.id) ?? [],
      access_profile_ids: profilesByUser.get(u.id) ?? []
    })
  );
}

export function sanitizeUserForClient(
  user: User & { api4com_api_token?: string | null; api4com_sip_password?: string | null }
): User {
  const has_api4com_api_token =
    user.has_api4com_api_token ?? Boolean(user.api4com_api_token?.trim());
  const has_api4com_sip_password =
    user.has_api4com_sip_password ?? Boolean(user.api4com_sip_password?.trim());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip secrets before client
  const { api4com_api_token, api4com_sip_password, ...rest } = user;
  return { ...rest, has_api4com_api_token, has_api4com_sip_password };
}

export async function listUsers(activeOnly = false) {
  const rows = await all<UserRow>(
    activeOnly
      ? "SELECT * FROM users WHERE status = 'active' ORDER BY name"
      : "SELECT * FROM users ORDER BY name"
  );
  return attachRoles(rows);
}

export async function getUserById(id: number) {
  const row = await get<UserRow>("SELECT * FROM users WHERE id = @id", { id });
  if (!row) return null;
  const [user] = await attachRoles([row]);
  return user;
}

export async function setUserRoles(userId: number, roles: UserRole[]) {
  await run("DELETE FROM user_roles WHERE user_id = @userId", { userId });
  for (const role of roles) {
    await run("INSERT INTO user_roles (user_id, role) VALUES (@userId, @role)", { userId, role });
  }
}

export async function deleteUser(id: number) {
  await run("DELETE FROM users WHERE id = @id", { id });
}

export async function replaceProductResponsibles(productId: number, userIds: number[]) {
  await run("DELETE FROM product_responsibles WHERE product_id = @productId", { productId });
  for (const userId of userIds) {
    await run("INSERT INTO product_responsibles (product_id, user_id) VALUES (@productId, @userId)", {
      productId,
      userId
    });
  }
}

export { attachRoles };
