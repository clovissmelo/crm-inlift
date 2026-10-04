import { validateAdministrativeRoles } from "@/lib/access-administrative";
import {
  ALL_MENU_KEYS,
  isMenuKey,
  resolveMenuKeysFromProfiles,
  type MenuKey,
  type ResolvedMenuAccess
} from "@/lib/access-menu";
import { all, get, nowIso, run } from "@/lib/db";
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
  administrative_roles: UserRole[];
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
    "SELECT menu_key FROM access_profile_menu_grants WHERE profile_id = @profileId ORDER BY menu_key",
    { profileId }
  );
  return rows.map((r) => r.menu_key).filter(isMenuKey);
}

async function loadAdministrativeRolesForProfile(profileId: number): Promise<UserRole[]> {
  const rows = await all<{ role: UserRole }>(
    "SELECT role FROM access_profile_role_grants WHERE profile_id = @profileId ORDER BY role",
    { profileId }
  );
  return validateAdministrativeRoles(rows.map((r) => r.role));
}

async function hydrateProfile(p: {
  id: number;
  slug: string;
  name: string;
  description: string;
  access_rank: number;
  active: boolean;
}): Promise<AccessProfileRow> {
  const id = Number(p.id);
  return {
    id,
    slug: String(p.slug),
    name: String(p.name),
    description: String(p.description ?? ""),
    access_rank: Number(p.access_rank),
    active: Boolean(p.active),
    menu_keys: await loadMenuKeysForProfile(id),
    administrative_roles: await loadAdministrativeRolesForProfile(id)
  };
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
    out.push(await hydrateProfile(p));
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
  return hydrateProfile(p);
}

export async function createAccessProfile(input: {
  name: string;
  description?: string;
  access_rank?: number;
  active?: boolean;
  menu_keys?: MenuKey[];
  administrative_roles?: UserRole[];
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
  const grants = normalizeProfileGrants(input);
  await setAccessProfileMenuGrants(Number(id), grants.menu_keys);
  await setAccessProfileAdministrativeRoles(Number(id), grants.administrative_roles);
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
    administrative_roles?: UserRole[];
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
  if (input.menu_keys !== undefined || input.administrative_roles !== undefined) {
    const grants = normalizeProfileGrants({
      menu_keys: input.menu_keys ?? existing.menu_keys,
      administrative_roles: input.administrative_roles ?? existing.administrative_roles
    });
    await setAccessProfileMenuGrants(id, grants.menu_keys);
    await setAccessProfileAdministrativeRoles(id, grants.administrative_roles);
  }
  const row = await getAccessProfile(id);
  if (!row) throw new Error("Perfil não encontrado.");
  return row;
}

export async function deleteAccessProfile(id: number) {
  await run("DELETE FROM access_profiles WHERE id = @id", { id });
}

function normalizeProfileGrants(input: {
  menu_keys?: MenuKey[];
  administrative_roles?: UserRole[];
}): { menu_keys: MenuKey[]; administrative_roles: UserRole[] } {
  const administrative_roles = validateAdministrativeRoles(input.administrative_roles ?? []);
  const menu_keys =
    administrative_roles.includes("admin") ? [...ALL_MENU_KEYS] : (input.menu_keys ?? []).filter(isMenuKey);
  return { menu_keys, administrative_roles };
}

async function setAccessProfileMenuGrants(profileId: number, menuKeys: MenuKey[]) {
  await run("DELETE FROM access_profile_menu_grants WHERE profile_id = @profileId", { profileId });
  for (const key of menuKeys) {
    if (!isMenuKey(key)) continue;
    await run(
      "INSERT INTO access_profile_menu_grants (profile_id, menu_key) VALUES (@profileId, @menuKey)",
      { profileId, menuKey: key }
    );
  }
}

async function setAccessProfileAdministrativeRoles(profileId: number, roles: UserRole[]) {
  await run("DELETE FROM access_profile_role_grants WHERE profile_id = @profileId", { profileId });
  for (const role of roles) {
    await run(
      "INSERT INTO access_profile_role_grants (profile_id, role) VALUES (@profileId, @role)",
      { profileId, role }
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

async function loadAdministrativeRolesForUserProfiles(userId: number): Promise<UserRole[]> {
  const rows = await all<{ role: UserRole }>(
    `
      SELECT DISTINCT g.role
      FROM user_access_profiles uap
      JOIN access_profiles p ON p.id = uap.profile_id AND p.active = true
      JOIN access_profile_role_grants g ON g.profile_id = p.id
      WHERE uap.user_id = @userId
      ORDER BY g.role
    `,
    { userId }
  );
  return validateAdministrativeRoles(rows.map((r) => r.role));
}

/** Papéis diretos em user_roles + papéis dos perfis de acesso ativos atribuídos ao usuário. */
export async function resolveEffectiveUserRoles(userId: number, directRoles: UserRole[]): Promise<UserRole[]> {
  const fromProfiles = await loadAdministrativeRolesForUserProfiles(userId);
  return [...new Set([...directRoles, ...fromProfiles])];
}

/** União dos papéis administrativos de perfis ativos (para sincronizar user_roles ao salvar usuário). */
export async function resolveAdministrativeRolesFromProfileIds(profileIds: number[]): Promise<UserRole[]> {
  const unique = [...new Set(profileIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return [];
  const merged = new Set<UserRole>();
  for (const profileId of unique) {
    const p = await get<{ active: boolean }>("SELECT active FROM access_profiles WHERE id = @profileId", { profileId });
    if (!p?.active) continue;
    for (const role of await loadAdministrativeRolesForProfile(profileId)) {
      merged.add(role);
    }
  }
  return [...merged];
}

export async function resolveUserMenuAccess(userId: number, roles: UserRole[]): Promise<ResolvedMenuAccess> {
  const effectiveRoles = await resolveEffectiveUserRoles(userId, roles);
  /** Papel Administrador (perfil ou user_roles) = menu completo, independente dos itens marcados na aba Acessos. */
  if (isAdmin({ roles: effectiveRoles })) return "all";
  const assigned = await loadUserAssignedProfiles(userId);
  return resolveMenuKeysFromProfiles(assigned);
}

export function validateMenuKeys(keys: string[]): MenuKey[] {
  return keys.filter(isMenuKey);
}

export { ALL_MENU_KEYS };
