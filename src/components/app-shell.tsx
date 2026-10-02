"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
import { pageCrumbSegments } from "@/lib/page-crumb";
import type { User } from "@/lib/types";

type NavItem = { href: Route; label: string; icon: typeof LayoutDashboard };

type NavSection = {
  title?: string;
  items: NavItem[];
};

const navTop: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prospeccao", label: "Leads para contato", icon: PhoneCall },
  { href: "/funil", label: "Funil de vendas", icon: Funnel },
  { href: "/agendamentos", label: "Agendamentos", icon: Calendar }
];

function buildNavSections(admin: boolean): NavSection[] {
  const clientesLeads: NavItem[] = [];
  if (admin) {
    clientesLeads.push({ href: "/admin/novos-leads", label: "Novos leads", icon: Sparkles });
  }
  clientesLeads.push(
    { href: "/organizacao-leads", label: "Organizar leads", icon: Filter },
    { href: "/clientes", label: "Clientes", icon: List }
  );

  const configuracao: NavItem[] = [{ href: "/abordagens", label: "Abordagem", icon: Target }];
  if (admin) {
    configuracao.push({ href: "/admin/prospeccao", label: "Prospecção", icon: Settings });
  }
  configuracao.push({ href: "/resultado-comercial", label: "Resultado Comercial", icon: ListChecks });
  if (admin) {
    configuracao.push({ href: "/admin/etapas-funil", label: "Etapas do Funil", icon: GitBranch });
  }

  const cadastros: NavItem[] = [];
  cadastros.push(
    { href: "/negocios-convertidos", label: "Negócios convertidos", icon: Trophy },
    { href: "/empresas", label: "Nossas empresas", icon: Building2 },
    { href: "/produtos", label: "Nossos produtos", icon: Package }
  );
  if (admin) {
    cadastros.push(
      { href: "/admin/usuarios", label: "Usuários", icon: Users },
      { href: "/admin", label: "Admin", icon: Shield }
    );
  }

  const sections: NavSection[] = [
    { items: navTop },
    { title: "Clientes e leads", items: clientesLeads },
    { title: "Configuração", items: configuracao },
    { title: "Cadastros", items: cadastros }
  ];

  return sections.filter((s) => s.items.length > 0);
}

function isAdminHubPath(pathname: string) {
  if (pathname === "/admin") return true;
  return (
    pathname.startsWith("/admin/integracoes") ||
    pathname.startsWith("/admin/variaveis") ||
    pathname.startsWith("/admin/anp-variaveis") ||
    pathname.startsWith("/admin/fluxos-geracao") ||
    pathname.startsWith("/admin/importacao")
  );
}

function NavLinkItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link href={item.href} className={clsx("nav-link", active && "active")}>
      <Icon size={18} aria-hidden />
      <span className="nav-link-label">{item.label}</span>
    </Link>
  );
}

export function AppShell({
  user,
  prospeccaoLeadsUpdatedAt,
  prospeccaoLeadsUpdatedLabel,
  children
}: {
  user: User;
  prospeccaoLeadsUpdatedAt: string | null;
  prospeccaoLeadsUpdatedLabel: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const crumbParts = pageCrumbSegments(pathname);
  const userIsAdmin = isAdmin(user);
  const navSections = buildNavSections(userIsAdmin);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="app-layout">
      <aside className={clsx("sidebar", mobileNavOpen && "is-nav-open")}>
        <div className="sidebar-header">
          <div className="brand">
            <Link href="/dashboard" className="sidebar-brand-link" aria-label="CRM Inlift — início">
              <Image
                src="/inlift-logo.png"
                alt="INLIFT GROUP"
                width={152}
                height={34}
                className="sidebar-logo"
                priority
              />
            </Link>
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
                if (item.href === "/admin") {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx("nav-link", isAdminHubPath(pathname) && "active")}
                    >
                      <Shield size={18} aria-hidden />
                      <span className="nav-link-label">{item.label}</span>
                    </Link>
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
        <main className="page-content">
          <Api4comCallProvider user={user}>{children}</Api4comCallProvider>
        </main>
      </div>
    </div>
  );
}
