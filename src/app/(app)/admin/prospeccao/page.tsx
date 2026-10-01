import { PageIntro } from "@/components/page-intro";
import { ProspeccaoStrategyAdmin } from "@/components/prospeccao-strategy-admin";

export default function AdminProspeccaoPage() {
  return (
    <div>
      <h1 className="page-title">Prospecção</h1>
      <PageIntro>
        Regras de atendimento pós-ligação, limite de tentativas sem contato e ordem da fila de prospecção.
      </PageIntro>
      <ProspeccaoStrategyAdmin />
    </div>
  );
}
