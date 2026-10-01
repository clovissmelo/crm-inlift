import { PageIntro } from "@/components/page-intro";
import { ProspeccaoStrategyAdmin } from "@/components/prospeccao-strategy-admin";

export default function AdminProspeccaoPage() {
  return (
    <div>
      <h1 className="page-title">Prospecção</h1>
      <PageIntro>Prioridades operacionais e estratégia de tentativas por telefone.</PageIntro>
      <ProspeccaoStrategyAdmin />
    </div>
  );
}
