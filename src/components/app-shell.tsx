"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Calendar,
  Filter,
  Funnel,
  LayoutDashboard,
  List,
  PhoneCall,
  Package,
  RotateCcw,
  Shield,
  Target,
  Users
} from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { isAdmin } from "@/lib/admin";
import type { User } from "@/lib/types";

const nav: Array<{ href: Route; label: string; icon: typeof LayoutDashboard }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/funil", label: "Funil", icon: Funnel },
  { href: "/prospeccao", label: "Leads para prospecção", icon: PhoneCall },
  { href: "/retornos", label: "Retornos", icon: RotateCcw },
  { href: "/agendamentos", label: "Agendamentos", icon: Calendar },
  { href: "/organizacao-leads", label: "Organização de Leads", icon: Filter },
  { href: "/clientes", label: "Clientes", icon: List },
  { href: "/abordagens", label: "Abordagens", icon: Target },
  { href: "/produtos", label: "Produtos", icon: Package }
];

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

  return (
    <div className="app-layout">
      <aside className="sidebar">
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
        <nav className="nav-list">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={clsx("nav-link", active && "active")}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          {isAdmin(user) ? (
            <Link
              href="/admin"
              className={clsx("nav-link", (pathname === "/admin" || pathname.startsWith("/admin/")) && "active")}
            >
              <Shield size={18} />
              Admin
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
          <UserMenu user={user} />
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
