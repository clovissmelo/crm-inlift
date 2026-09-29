import { AdminLeadGenerationFlows } from "@/components/admin-lead-generation-flows";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

export default function AdminFluxosGeracaoPage() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
        {" · "}
        <Link href="/admin/variaveis">Motor de leads</Link>
      </p>
      <PageIntro>
        Configure fluxos de geração: etapas ordenadas, política de falha e limites de consulta. Associe um fluxo padrão
        em Segmentos (Motor de leads).
      </PageIntro>
      <AdminLeadGenerationFlows />
    </div>
  );
}
