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
  RotateCcw,
  Settings2,
  Target,
  Users
} from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import type { User } from "@/lib/types";

const nav: Array<{ href: Route; label: string; icon: typeof LayoutDashboard }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prospeccao", label: "Leads para prospecção", icon: PhoneCall },
  { href: "/clientes", label: "Lista de clientes", icon: List },
  { href: "/organizacao-leads", label: "Organização de leads", icon: Filter },
  { href: "/abordagens", label: "Abordagens", icon: Target },
  { href: "/retornos", label: "Retornos", icon: RotateCcw },
  { href: "/agendamentos", label: "Agendamentos", icon: Calendar },
  { href: "/funil", label: "Funil", icon: Funnel },
  { href: "/cadastros", label: "Cadastros", icon: Settings2 }
];

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
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
        </nav>
        <div className="muted" style={{ marginTop: "auto", fontSize: "0.75rem" }}>
          <Users size={14} style={{ display: "inline", verticalAlign: "middle" }} /> CRM Inlift
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
