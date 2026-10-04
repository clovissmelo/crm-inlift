import { AdminLeadGenerationFlows } from "@/components/admin-lead-generation-flows";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

export default function AdminFluxosGeracaoPage() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
        {" · "}
        <Link href="/admin/variaveis">ANP</Link>
      </p>
      <PageIntro>
        Configure fluxos de enriquecimento: etapas ordenadas, política de falha e limites de consulta. Associe fluxo e
        segmento em cada <Link href="/produtos">Produto</Link>; o segmento ANP vem de{" "}
        <Link href="/admin/variaveis">ANP</Link>.
      </PageIntro>
      <AdminLeadGenerationFlows />
    </div>
  );
}
