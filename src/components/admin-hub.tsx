import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, Sparkles, SlidersHorizontal, Users } from "lucide-react";
import type { Route } from "next";

type HubItem = {
  href: Route;
  icon: LucideIcon;
  title: string;
  description: string;
};

const ADMIN_ITEMS: HubItem[] = [
  {
    href: "/admin/usuarios",
    icon: Users,
    title: "Usuários",
    description: "Equipe, perfis de acesso e situação da conta."
  },
  {
    href: "/admin/variaveis",
    icon: SlidersHorizontal,
    title: "Variáveis para as APIs",
    description: "Google Agenda, Places, integrações e chaves do projeto."
  },
  {
    href: "/admin/novos-leads",
    icon: Sparkles,
    title: "Novos leads",
    description: "Busca de leads novos com o motor de descoberta."
  },
  {
    href: "/admin/importacao",
    icon: FileSpreadsheet,
    title: "Importação de planilhas",
    description: "Carga em massa de clientes e contatos."
  }
];

export function AdminHub() {
  return (
    <div className="hub-page">
      <header className="hub-page-header">
        <h1 style={{ margin: 0 }}>Admin</h1>
        <p className="muted" style={{ margin: "0.5rem 0 0", maxWidth: "36rem" }}>
          Configurações avançadas, usuários, integrações e ferramentas de crescimento do funil.
        </p>
      </header>
      <ul className="hub-card-grid">
        {ADMIN_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} className="hub-card">
                <span className="hub-card-icon" aria-hidden>
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span className="hub-card-title">{item.title}</span>
                <span className="hub-card-desc">{item.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
