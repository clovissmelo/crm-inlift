import { ADMIN_CONFIG_CARDS, AdminConfigCardGrid } from "@/components/admin-config-card-grid";
import { PageIntro } from "@/components/page-intro";
import Link from "next/link";

const INTEGRATION_IDS = new Set(["api4com", "google-agenda", "google-places"]);

export function AdminIntegracoesHub() {
  const items = ADMIN_CONFIG_CARDS.filter((c) => INTEGRATION_IDS.has(c.id));

  return (
    <div>
      <PageIntro>
        Telefonia e Google. Credenciais no servidor; após salvar, segredos não voltam ao navegador.{" "}
        <Link href="/admin">← Admin (todas as configurações)</Link>
      </PageIntro>
      <AdminConfigCardGrid items={items} />
    </div>
  );
}
