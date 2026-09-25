import { all, get, run } from "@/lib/db";
import type { User, UserRole } from "@/lib/types";

type UserRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  photo_path: string | null;
  status: "active" | "inactive";
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
  return users.map((u) => ({
    ...u,
    roles: byUser.get(u.id) ?? []
  }));
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
