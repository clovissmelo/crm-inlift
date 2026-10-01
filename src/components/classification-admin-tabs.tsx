"use client";

import Link from "next/link";
import { ResultadoComercialAdmin } from "@/components/resultado-comercial-admin";

export function ClassificationAdminTabs({ canDelete }: { canDelete?: boolean }) {
  return (
    <div>
      <p className="muted" style={{ maxWidth: 720, marginBottom: "1rem" }}>
        Catálogo de nomes e slugs dos resultados comerciais. Regras operacionais (tentativas, próximo passo, funil e
        saída da fila) são configuradas em{" "}
        <Link href="/admin/prospeccao">Admin → Prospecção → Regras de atendimento</Link>. A matriz técnica legada não é
        mais editável aqui — o mapeamento API4COM permanece na integração.
      </p>
      <ResultadoComercialAdmin canDelete={canDelete} commercialOnly />
    </div>
  );
}
