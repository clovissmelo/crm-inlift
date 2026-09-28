import { AdminConfigCardGrid } from "@/components/admin-config-card-grid";
import { PageIntro } from "@/components/page-intro";

export function AdminHub() {
  return (
    <div className="hub-page">
      <header className="hub-page-header">
        <PageIntro>
          Escolha uma configuração abaixo. Chaves Google e credenciais ficam no banco (Integrações), não na Vercel.
        </PageIntro>
      </header>
      <AdminConfigCardGrid />
    </div>
  );
}
