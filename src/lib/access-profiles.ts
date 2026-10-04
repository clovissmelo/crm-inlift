import { all, get, nowIso, run } from "@/lib/db";
import {
  ALL_MENU_KEYS,
  isMenuKey,
  resolveMenuKeysFromProfiles,
  type MenuKey,
  type ResolvedMenuAccess
} from "@/lib/access-menu";
import type { UserRole } from "@/lib/types";
import { isAdmin } from "@/lib/admin";

export type AccessProfileRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  access_rank: number;
  active: boolean;
  menu_keys: MenuKey[];
};

function slugifyProfileName(name: string): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "perfil";
  return base.slice(0, 80);
}

async function uniqueProfileSlug(base: string, excludeId?: number): Promise<string> {
  let slug = base;
  let n = 2;
  for (;;) {
    const row = await get<{ id: number }>(
      excludeId != null
        ? "SELECT id FROM access_profiles WHERE slug = @slug AND id <> @excludeId LIMIT 1"
        : "SELECT id FROM access_profiles WHERE slug = @slug LIMIT 1",
      excludeId != null ? { slug, excludeId } : { slug }
    );
    if (!row) return slug;
    slug = `${base}_${n}`.slice(0, 96);
    n += 1;
  }
}

async function loadMenuKeysForProfile(profileId: number): Promise<MenuKey[]> {
  const rows = await all<{ menu_key: string }>(
    "SELECT menu_key FROM access_profile_menu_grants WHERE profile_id = @id ORDER BY menu_key",
    { id: profileId }
  );
  return rows.map((r) => r.menu_key).filter(isMenuKey);
}

export async function listAccessProfiles(): Promise<AccessProfileRow[]> {
  const profiles = await all<{
    id: number;
    slug: string;
    name: string;
    description: string;
    access_rank: number;
    active: boolean;
  }>("SELECT id, slug, name, description, access_rank, active FROM access_profiles ORDER BY access_rank DESC, name ASC");
  const out: AccessProfileRow[] = [];
  for (const p of profiles) {
    out.push({
      id: Number(p.id),
      slug: String(p.slug),
      name: String(p.name),
      description: String(p.description ?? ""),
      access_rank: Number(p.access_rank),
      active: Boolean(p.active),
      menu_keys: await loadMenuKeysForProfile(Number(p.id))
    });
  }
  return out;
}

export async function getAccessProfile(id: number): Promise<AccessProfileRow | null> {
  const p = await get<{
    id: number;
    slug: string;
    name: string;
    description: string;
    access_rank: number;
    active: boolean;
  }>("SELECT id, slug, name, description, access_rank, active FROM access_profiles WHERE id = @id", { id });
  if (!p) return null;
  return {
    id: Number(p.id),
    slug: String(p.slug),
    name: String(p.name),
    description: String(p.description ?? ""),
    access_rank: Number(p.access_rank),
    active: Boolean(p.active),
    menu_keys: await loadMenuKeysForProfile(Number(p.id))
  };
}

export async function createAccessProfile(input: {
  name: string;
  description?: string;
  access_rank?: number;
  active?: boolean;
  menu_keys?: MenuKey[];
}): Promise<AccessProfileRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do perfil.");
  const slug = await uniqueProfileSlug(slugifyProfileName(name));
  const now = nowIso();
  const inserted = await run(
    `
      INSERT INTO access_profiles (slug, name, description, access_rank, active, created_at, updated_at)
      VALUES (@slug, @name, @description, @accessRank, @active, @now, @now)
    `,
    {
      slug,
      name,
      description: (input.description ?? "").trim(),
      accessRank: input.access_rank ?? 0,
      active: input.active !== false,
      now
    }
  );
  const id = inserted.lastInsertRowid;
  if (id == null) throw new Error("Não foi possível criar o perfil.");
  const keys = (input.menu_keys ?? []).filter(isMenuKey);
  await setAccessProfileMenuGrants(Number(id), keys);
  const row = await getAccessProfile(Number(id));
  if (!row) throw new Error("Perfil criado mas não encontrado.");
  return row;
}

export async function updateAccessProfile(
  id: number,
  input: {
    name?: string;
    description?: string;
    access_rank?: number;
    active?: boolean;
    menu_keys?: MenuKey[];
  }
): Promise<AccessProfileRow> {
  const existing = await getAccessProfile(id);
  if (!existing) throw new Error("Perfil não encontrado.");
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, string | number | boolean> = { id, now: nowIso() };
  if (input.name != null) {
    sets.push("name = @name");
    params.name = input.name.trim();
  }
  if (input.description != null) {
    sets.push("description = @description");
    params.description = input.description.trim();
  }
  if (input.access_rank != null) {
    sets.push("access_rank = @accessRank");
    params.accessRank = input.access_rank;
  }
  if (input.active != null) {
    sets.push("active = @active");
    params.active = input.active;
  }
  await run(`UPDATE access_profiles SET ${sets.join(", ")} WHERE id = @id`, params);
  if (input.menu_keys) {
    await setAccessProfileMenuGrants(id, input.menu_keys.filter(isMenuKey));
  }
  const row = await getAccessProfile(id);
  if (!row) throw new Error("Perfil não encontrado.");
  return row;
}

export async function deleteAccessProfile(id: number) {
  await run("DELETE FROM access_profiles WHERE id = @id", { id });
}

async function setAccessProfileMenuGrants(profileId: number, menuKeys: MenuKey[]) {
  await run("DELETE FROM access_profile_menu_grants WHERE profile_id = @id", { id: profileId });
  for (const key of menuKeys) {
    if (!isMenuKey(key)) continue;
    await run(
      "INSERT INTO access_profile_menu_grants (profile_id, menu_key) VALUES (@profileId, @menuKey)",
      { profileId, menuKey: key }
    );
  }
}

export async function listUserAccessProfileIds(userId: number): Promise<number[]> {
  const rows = await all<{ profile_id: number }>(
    "SELECT profile_id FROM user_access_profiles WHERE user_id = @userId ORDER BY profile_id",
    { userId }
  );
  return rows.map((r) => Number(r.profile_id));
}

export async function setUserAccessProfiles(userId: number, profileIds: number[]) {
  await run("DELETE FROM user_access_profiles WHERE user_id = @userId", { userId });
  const unique = [...new Set(profileIds.filter((id) => Number.isInteger(id) && id > 0))];
  for (const profileId of unique) {
    await run(
      "INSERT INTO user_access_profiles (user_id, profile_id) VALUES (@userId, @profileId)",
      { userId, profileId }
    );
  }
}

export async function loadUserAssignedProfiles(userId: number) {
  const profiles = await all<{ id: number; access_rank: number; active: boolean }>(
    `
      SELECT p.id, p.access_rank, p.active
      FROM user_access_profiles uap
      JOIN access_profiles p ON p.id = uap.profile_id
      WHERE uap.user_id = @userId
    `,
    { userId }
  );
  const out: Array<{ access_rank: number; active: boolean; menu_keys: string[] }> = [];
  for (const p of profiles) {
    out.push({
      access_rank: Number(p.access_rank),
      active: Boolean(p.active),
      menu_keys: await loadMenuKeysForProfile(Number(p.id))
    });
  }
  return out;
}

export async function resolveUserMenuAccess(userId: number, roles: UserRole[]): Promise<ResolvedMenuAccess> {
  if (isAdmin({ roles })) return "all";
  const assigned = await loadUserAssignedProfiles(userId);
  return resolveMenuKeysFromProfiles(assigned);
}

export function validateMenuKeys(keys: string[]): MenuKey[] {
  return keys.filter(isMenuKey);
}
