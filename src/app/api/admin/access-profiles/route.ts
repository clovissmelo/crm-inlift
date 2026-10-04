import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { validateAdministrativeRoles, ADMINISTRATIVE_ROLE_DEFINITIONS } from "@/lib/access-administrative";
import { createAccessProfile, listAccessProfiles, updateAccessProfile, validateMenuKeys } from "@/lib/access-profiles";
import { ALL_MENU_KEYS, MENU_DEFINITIONS, MENU_SECTION_LABELS } from "@/lib/access-menu";
import { z } from "zod";

const profileBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  access_rank: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
  menu_keys: z.array(z.string()).optional(),
  administrative_roles: z.array(z.enum(["bdr", "product_owner", "manager", "admin"])).optional()
});

const patchSchema = profileBodySchema.extend({
  id: z.number().int().positive()
});

export async function GET() {
  const user = await requireApiUser();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const profiles = await listAccessProfiles();
  return Response.json({
    profiles,
    menu_catalog: MENU_DEFINITIONS,
    menu_sections: MENU_SECTION_LABELS,
    all_menu_keys: ALL_MENU_KEYS,
    administrative_roles_catalog: ADMINISTRATIVE_ROLE_DEFINITIONS
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const parsed = profileBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const profile = await createAccessProfile({
      ...parsed.data,
      menu_keys: validateMenuKeys(parsed.data.menu_keys ?? []),
      administrative_roles: validateAdministrativeRoles(parsed.data.administrative_roles ?? [])
    });
    return Response.json({ profile }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao criar" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const profile = await updateAccessProfile(parsed.data.id, {
      name: parsed.data.name,
      description: parsed.data.description,
      access_rank: parsed.data.access_rank,
      active: parsed.data.active,
      menu_keys: parsed.data.menu_keys ? validateMenuKeys(parsed.data.menu_keys) : undefined,
      administrative_roles: parsed.data.administrative_roles
        ? validateAdministrativeRoles(parsed.data.administrative_roles)
        : undefined
    });
    return Response.json({ profile });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
