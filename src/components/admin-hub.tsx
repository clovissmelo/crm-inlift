import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, GitBranch, PhoneCall, Sparkles, SlidersHorizontal, Users } from "lucide-react";
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
    href: "/admin/etapas-funil",
    icon: GitBranch,
    title: "Etapas do funil comercial",
    description: "Colunas do kanban, ordem, cores e zonas de convertido e perdido."
  },
  {
    href: "/admin/integracoes",
    icon: PhoneCall,
    title: "Integrações",
    description: "API4COM (telefonia), webhooks e instruções de configuração."
  },
  {
    href: "/admin/variaveis",
    icon: SlidersHorizontal,
    title: "Variáveis para as APIs",
    description: "Google Agenda, Places, chaves e tokens no servidor."
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
        <PageIntro>
          Configurações avançadas, usuários, integrações e ferramentas de crescimento do funil.
        </PageIntro>
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
