import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Building2, Package, Users } from "lucide-react";
import type { Route } from "next";

type HubItem = {
  href: Route;
  icon: LucideIcon;
  title: string;
  description: string;
};

const CADASTROS_ITEMS: HubItem[] = [
  {
    href: "/cadastros/usuarios",
    icon: Users,
    title: "Usuários",
    description: "Equipe, perfis de acesso e situação da conta."
  },
  {
    href: "/cadastros/produtos",
    icon: Package,
    title: "Produtos",
    description: "Linhas comerciais, proposta e responsáveis."
  },
  {
    href: "/clientes/novo",
    icon: Building2,
    title: "Novo cliente",
    description: "Incluir lead manualmente no CRM."
  }
];

export function CadastrosHub() {
  return (
    <div className="hub-page">
      <header className="hub-page-header">
        <h1 style={{ margin: 0 }}>Cadastros</h1>
        <p className="muted" style={{ margin: "0.5rem 0 0", maxWidth: "36rem" }}>
          Estrutura base do CRM: pessoas, produtos e clientes. Integrações e importação em massa ficam em Admin.
        </p>
      </header>
      <ul className="hub-card-grid">
        {CADASTROS_ITEMS.map((item) => {
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
