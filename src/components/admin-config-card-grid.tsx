import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  LogoApi4com,
  LogoGoogleCalendar,
  LogoGooglePlaces,
  LogoImportSheet,
  LogoSettings
} from "@/components/admin-config-logos";

export type AdminConfigCardItem = {
  id: string;
  href: Route;
  title: string;
  description: string;
  logo: ReactNode;
  iconClassName: string;
};

export const ADMIN_CONFIG_CARDS: AdminConfigCardItem[] = [
  {
    id: "api4com",
    href: "/admin/integracoes/api4com",
    title: "API4COM",
    description: "Telefonia, webhooks e registro de chamadas.",
    logo: <LogoApi4com />,
    iconClassName: "hub-card-icon--api4com"
  },
  {
    id: "google-agenda",
    href: "/admin/integracoes/google-agenda" as Route,
    title: "Google Agenda",
    description: "OAuth no banco, Meet e sync de reuniões.",
    logo: <LogoGoogleCalendar />,
    iconClassName: "hub-card-icon--google-cal"
  },
  {
    id: "google-places",
    href: "/admin/integracoes/google-places",
    title: "Google Places",
    description: "Chave API para enriquecimento de leads.",
    logo: <LogoGooglePlaces />,
    iconClassName: "hub-card-icon--google-places"
  },
  {
    id: "variaveis",
    href: "/admin/variaveis",
    title: "Segmentos ANP",
    description: "Tipos de posto e filtro na base revendedores (Novos leads e Produtos).",
    logo: <LogoSettings />,
    iconClassName: "hub-card-icon--settings"
  },
  {
    id: "anp-variaveis",
    href: "/admin/anp-variaveis" as Route,
    title: "Variáveis ANP",
    description: "Simulação, provedor e notas das fontes públicas ANP.",
    logo: <LogoSettings />,
    iconClassName: "hub-card-icon--settings"
  },
  {
    id: "fluxos-geracao",
    href: "/admin/fluxos-geracao" as Route,
    title: "Fluxos de geração",
    description: "Pipeline de enriquecimento (Google, CNPJ, CRM).",
    logo: <LogoSettings />,
    iconClassName: "hub-card-icon--settings"
  },
  {
    id: "importacao",
    href: "/admin/importacao",
    title: "Importação",
    description: "Carga em massa de clientes e contatos.",
    logo: <LogoImportSheet />,
    iconClassName: "hub-card-icon--import"
  },
  {
    id: "prospeccao",
    href: "/admin/prospeccao" as Route,
    title: "Prospecção",
    description: "Prioridades operacionais e estratégia de ligações por telefone.",
    logo: <LogoSettings />,
    iconClassName: "hub-card-icon--settings"
  }
];

export function AdminConfigCardGrid({ items = ADMIN_CONFIG_CARDS }: { items?: AdminConfigCardItem[] }) {
  return (
    <ul className="hub-card-grid hub-card-grid--config">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} className="hub-card hub-card--config">
            <span className={`hub-card-icon ${item.iconClassName}`} aria-hidden>
              {item.logo}
            </span>
            <span className="hub-card-title">{item.title}</span>
            <span className="hub-card-desc">{item.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
