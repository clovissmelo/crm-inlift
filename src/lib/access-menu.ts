/** Itens de menu controláveis por perfil de acesso (sidebar). Rotas /admin/* exigem role admin além do menu. */

export const MENU_SECTION_LABELS: Record<string, string> = {
  top: "Principal",
  clientes_leads: "Clientes e leads",
  configuracao: "Configuração",
  cadastros: "Cadastros"
};

export type MenuKey =
  | "dashboard"
  | "prospeccao"
  | "funil"
  | "agendamentos"
  | "novos_leads"
  | "organizacao_leads"
  | "clientes"
  | "abordagens"
  | "prospeccao_config"
  | "resultado_comercial"
  | "etapas_funil"
  | "negocios_convertidos"
  | "empresas"
  | "produtos"
  | "usuarios"
  | "admin_hub";

export type MenuDefinition = {
  key: MenuKey;
  href: string;
  label: string;
  section: keyof typeof MENU_SECTION_LABELS;
  /** Só aparece com role admin (ignora perfil de acesso). */
  requiresAdminRole?: boolean;
};

export const MENU_DEFINITIONS: MenuDefinition[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", section: "top" },
  { key: "prospeccao", href: "/prospeccao", label: "Leads para contato", section: "top" },
  { key: "funil", href: "/funil", label: "Funil de vendas", section: "top" },
  { key: "agendamentos", href: "/agendamentos", label: "Agendamentos", section: "top" },
  { key: "novos_leads", href: "/admin/novos-leads", label: "Novos leads", section: "clientes_leads", requiresAdminRole: true },
  { key: "organizacao_leads", href: "/organizacao-leads", label: "Organizar leads", section: "clientes_leads" },
  { key: "clientes", href: "/clientes", label: "Clientes", section: "clientes_leads" },
  { key: "abordagens", href: "/abordagens", label: "Abordagem", section: "configuracao" },
  { key: "prospeccao_config", href: "/admin/prospeccao", label: "Prospecção", section: "configuracao", requiresAdminRole: true },
  { key: "resultado_comercial", href: "/resultado-comercial", label: "Resultado Comercial", section: "configuracao" },
  { key: "etapas_funil", href: "/admin/etapas-funil", label: "Etapas do Funil", section: "configuracao", requiresAdminRole: true },
  { key: "negocios_convertidos", href: "/negocios-convertidos", label: "Negócios convertidos", section: "cadastros" },
  { key: "empresas", href: "/empresas", label: "Nossas empresas", section: "cadastros" },
  { key: "produtos", href: "/produtos", label: "Nossos produtos", section: "cadastros" },
  { key: "usuarios", href: "/admin/usuarios", label: "Usuários", section: "cadastros", requiresAdminRole: true },
  { key: "admin_hub", href: "/admin", label: "Admin", section: "cadastros", requiresAdminRole: true }
];

export const ALL_MENU_KEYS = MENU_DEFINITIONS.map((d) => d.key);

const MENU_KEY_SET = new Set<string>(ALL_MENU_KEYS);

export function isMenuKey(value: string): value is MenuKey {
  return MENU_KEY_SET.has(value);
}

/** Menu padrão quando o usuário não tem perfil de acesso atribuído (comportamento legado). */
export const LEGACY_DEFAULT_MENU_KEYS: MenuKey[] = [
  "dashboard",
  "prospeccao",
  "funil",
  "agendamentos",
  "organizacao_leads",
  "clientes",
  "abordagens",
  "resultado_comercial",
  "negocios_convertidos",
  "empresas",
  "produtos"
];

export type ResolvedMenuAccess = "all" | Set<MenuKey>;

export function resolveMenuKeysFromProfiles(
  assignedProfiles: Array<{ access_rank: number; menu_keys: string[]; active: boolean }>
): Set<MenuKey> {
  const active = assignedProfiles.filter((p) => p.active);
  if (active.length === 0) {
    return new Set(LEGACY_DEFAULT_MENU_KEYS);
  }
  const maxRank = Math.max(...active.map((p) => p.access_rank));
  const winning = active.filter((p) => p.access_rank === maxRank);
  const keys = new Set<MenuKey>();
  for (const profile of winning) {
    for (const raw of profile.menu_keys) {
      if (isMenuKey(raw)) keys.add(raw);
    }
  }
  if (keys.size === 0) keys.add("dashboard");
  return keys;
}

export function menuKeyForPathname(pathname: string): MenuKey | null {
  let best: MenuDefinition | null = null;
  for (const def of MENU_DEFINITIONS) {
    if (pathname === def.href || pathname.startsWith(`${def.href}/`)) {
      if (!best || def.href.length > best.href.length) best = def;
    }
  }
  if (pathname.startsWith("/admin") && pathname !== "/admin" && !best) {
    return "admin_hub";
  }
  return best?.key ?? null;
}

export function serializeMenuAccessForClient(access: ResolvedMenuAccess): MenuKey[] | "all" {
  if (access === "all") return "all";
  return [...access];
}

export function parseMenuAccessFromClient(payload: MenuKey[] | "all"): ResolvedMenuAccess {
  if (payload === "all") return "all";
  return new Set(payload.filter(isMenuKey));
}

export function canAccessPath(pathname: string, access: ResolvedMenuAccess, isAdminRole: boolean): boolean {
  if (access === "all") return true;
  const key = menuKeyForPathname(pathname);
  if (!key) return true;
  const def = MENU_DEFINITIONS.find((d) => d.key === key);
  if (def?.requiresAdminRole && !isAdminRole) return false;
  return access.has(key);
}
