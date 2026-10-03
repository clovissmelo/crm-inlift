import { PageIntro } from "@/components/page-intro";
import { ProspeccaoStrategyAdmin } from "@/components/prospeccao-strategy-admin";

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function AdminProspeccaoPage({ searchParams }: Props) {
  const sp = await searchParams;
  const initialTab = sp.tab === "queue" ? "queue" : "rules";
  return (
    <div>
      <h1 className="page-title">Prospecção</h1>
      <PageIntro>
        Regras de atendimento pós-ligação, limite de tentativas sem contato e ordem da fila de prospecção.
      </PageIntro>
      <ProspeccaoStrategyAdmin initialTab={initialTab} />
    </div>
  );
}
