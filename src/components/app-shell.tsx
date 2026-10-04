"use client";

import Image from "next/image";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { MainOverlayHostProvider } from "@/components/main-overlay-host";
import { closeLeadGenOverlays } from "@/lib/lead-generation/lead-gen-overlay-control";
import clsx from "clsx";
import {
  Building2,
  Calendar,
  Filter,
  Funnel,
  GitBranch,
  LayoutDashboard,
  List,
  ListChecks,
  Menu,
  PhoneCall,
  Package,
  Settings,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Users,
  X
} from "lucide-react";
import { Api4comCallProvider } from "@/components/api4com-call-provider";
import { UserMenu } from "@/components/user-menu";
import { isAdmin } from "@/lib/admin";
import {
  canAccessPath,
  MENU_DEFINITIONS,
  MENU_SECTION_LABELS,
  MENU_SECTION_ORDER,
  parseMenuAccessFromClient,
  type MenuKey,
  type ResolvedMenuAccess
} from "@/lib/access-menu";
import { pageCrumbSegments } from "@/lib/page-crumb";
import type { User } from "@/lib/types";

type NavItem = { href: Route; label: string; icon: typeof LayoutDashboard; menuKey: MenuKey };

type NavSection = {
  title?: string;
  items: NavItem[];
};

const MENU_ICONS: Record<MenuKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  prospeccao: PhoneCall,
  funil: Funnel,
  agendamentos: Calendar,
  novos_leads: Sparkles,
  organizacao_leads: Filter,
  clientes: List,
  abordagens: Target,
  prospeccao_config: Settings,
  resultado_comercial: ListChecks,
  etapas_funil: GitBranch,
  negocios_convertidos: Trophy,
  empresas: Building2,
  produtos: Package,
  usuarios: Users,
  admin_hub: Shield
};

function buildNavSections(menuAccess: ResolvedMenuAccess): NavSection[] {
  const allowed: Set<MenuKey> | "all" =
    menuAccess === "all" ? "all" : menuAccess;

  const sections: NavSection[] = [];
  for (const sectionKey of MENU_SECTION_ORDER) {
    const items: NavItem[] = [];
    for (const def of MENU_DEFINITIONS) {
      if (def.section !== sectionKey) continue;
      if (allowed !== "all" && !allowed.has(def.key)) continue;
      items.push({
        href: def.href as Route,
        label: def.label,
        icon: MENU_ICONS[def.key],
        menuKey: def.key
      });
    }
    if (items.length > 0) {
      sections.push({
        title: sectionKey === "top" ? undefined : MENU_SECTION_LABELS[sectionKey],
        items
      });
    }
  }
  return sections;
}

function isAdminHubPath(pathname: string) {
  if (pathname === "/admin") return true;
  return (
    pathname.startsWith("/admin/integracoes") ||
    pathname.startsWith("/admin/variaveis") ||
    pathname.startsWith("/admin/anp-variaveis") ||
    pathname.startsWith("/admin/fluxos-geracao") ||
    pathname.startsWith("/admin/importacao") ||
    pathname.startsWith("/admin/perfis-acessos")
  );
}

/** Links nativos: evita transição Next pendente enquanto page-sync (motor) está em flight. */
function handleSidebarNavClick(e: MouseEvent<HTMLAnchorElement>, active: boolean) {
  closeLeadGenOverlays();
  if (active) e.preventDefault();
}

function NavLinkItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <a
      href={item.href}
      className={clsx("nav-link", active && "active")}
      aria-current={active ? "page" : undefined}
      onClick={(e) => handleSidebarNavClick(e, active)}
    >
      <Icon size={18} aria-hidden />
      <span className="nav-link-label">{item.label}</span>
    </a>
  );
}

export function AppShell({
  user,
  menuAccess,
  prospeccaoLeadsUpdatedAt,
  prospeccaoLeadsUpdatedLabel,
  children
}: {
  user: User;
  menuAccess: MenuKey[] | "all";
  prospeccaoLeadsUpdatedAt: string | null;
  prospeccaoLeadsUpdatedLabel: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  const overlayHostRef = useCallback((node: HTMLDivElement | null) => {
    setOverlayHost(node);
  }, []);
  const crumbParts = pageCrumbSegments(pathname);
  const userIsAdmin = isAdmin(user);
  const resolvedMenuAccess = parseMenuAccessFromClient(menuAccess);
  const navSections = buildNavSections(resolvedMenuAccess);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (userIsAdmin) return;
    if (!canAccessPath(pathname, resolvedMenuAccess, userIsAdmin)) {
      router.replace("/dashboard");
    }
  }, [pathname, resolvedMenuAccess, router, userIsAdmin]);

  return (
    <MainOverlayHostProvider host={overlayHost}>
    <div className="app-layout">
      <aside className={clsx("sidebar", mobileNavOpen && "is-nav-open")}>
        <div className="sidebar-header">
          <div className="brand">
            <a
              href="/dashboard"
              className="sidebar-brand-link"
              aria-label="CRM Inlift — início"
              onClick={(e) => handleSidebarNavClick(e, pathname === "/dashboard")}
            >
              <Image
                src="/inlift-logo.png"
                alt="INLIFT GROUP"
                width={152}
                height={34}
                className="sidebar-logo"
                priority
              />
            </a>
          </div>
          <button
            type="button"
            className="sidebar-menu-toggle btn"
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar-nav"
            aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
        <nav id="app-sidebar-nav" className="nav-list">
          {navSections.map((section) => (
            <div key={section.title ?? "top"}>
              {section.title ? <p className="nav-section-label">{section.title}</p> : null}
              {section.items.map((item) => {
                if (item.menuKey === "admin_hub") {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className={clsx("nav-link", isAdminHubPath(pathname) && "active")}
                      aria-current={isAdminHubPath(pathname) ? "page" : undefined}
                      onClick={(e) => handleSidebarNavClick(e, isAdminHubPath(pathname))}
                    >
                      <Shield size={18} aria-hidden />
                      <span className="nav-link-label">{item.label}</span>
                    </a>
                  );
                }
                return <NavLinkItem key={item.href} item={item} pathname={pathname} />;
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer muted">
          <div className="sidebar-footer-brand">
            <Users size={14} aria-hidden />
            <span>CRM Inlift</span>
          </div>
          <p className="sidebar-footer-meta">
            {prospeccaoLeadsUpdatedLabel ? (
              <>
                Últ. leads prospecção:{" "}
                <time dateTime={prospeccaoLeadsUpdatedAt ?? undefined}>{prospeccaoLeadsUpdatedLabel}</time>
              </>
            ) : (
              "Nenhum lead carregado ainda"
            )}
          </p>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <p className="topbar-crumb" aria-label={`Localização: ${crumbParts.join(", ")}`}>
            {crumbParts.map((part, i) => (
              <span key={`${part}-${i}`}>
                {i > 0 ? <span className="topbar-crumb-sep" aria-hidden> • </span> : null}
                {part}
              </span>
            ))}
          </p>
          <UserMenu user={user} />
        </header>
        <div className="main-column-body">
          <main className="page-content">
            <Api4comCallProvider user={user}>{children}</Api4comCallProvider>
          </main>
          <div ref={overlayHostRef} id="app-main-overlay-root" className="app-main-overlay-root" aria-hidden />
        </div>
      </div>
    </div>
    </MainOverlayHostProvider>
  );
}
