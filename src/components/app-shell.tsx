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
  LayoutDashboard,
  List,
  Menu,
  PhoneCall,
  Package,
  Shield,
  Target,
  Trophy,
  Users,
  X
} from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { isAdmin } from "@/lib/admin";
import { pageCrumbSegments } from "@/lib/page-crumb";
import type { User } from "@/lib/types";

type NavItem = { href: Route; label: string; icon: typeof LayoutDashboard };

const navMain: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/funil", label: "Funil", icon: Funnel },
  { href: "/prospeccao", label: "Leads para prospecção", icon: PhoneCall },
  { href: "/agendamentos", label: "Agendamentos", icon: Calendar },
  { href: "/negocios-convertidos", label: "Negócios convertidos", icon: Trophy },
  { href: "/clientes", label: "Clientes", icon: List },
  { href: "/abordagens", label: "Abordagens", icon: Target }
];

const navGestao: NavItem[] = [
  { href: "/organizacao-leads", label: "Organização de Leads", icon: Filter },
  { href: "/empresas", label: "Empresas", icon: Building2 },
  { href: "/produtos", label: "Produtos", icon: Package }
];

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
          {navMain.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} />
          ))}
          <p className="nav-section-label">Gestão</p>
          {navGestao.map((item) => (
            <NavLinkItem key={item.href} item={item} pathname={pathname} />
          ))}
          {isAdmin(user) ? (
            <Link
              href="/admin"
              className={clsx("nav-link", (pathname === "/admin" || pathname.startsWith("/admin/")) && "active")}
            >
              <Shield size={18} aria-hidden />
              <span className="nav-link-label">Admin</span>
            </Link>
          ) : null}
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
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
