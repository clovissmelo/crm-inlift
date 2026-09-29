"use client";

import { AdminLeadMotorSegments } from "@/components/admin-lead-motor-segments";
import { PageIntro } from "@/components/page-intro";
import Link from "next/link";

/** Segmentos ANP (postos) — rótulos e filtro da base revendedores. Fluxo e produto: cadastros separados. */
export function AdminApiVariables() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Segmentos usados em <strong>Novos leads</strong> e no cadastro de <strong>Produtos</strong>. Cada segmento define como
        filtrar postos na API de <strong>revendedores ANP</strong> (bandeira, distribuidora, TRR, etc.). O{" "}
        <strong>fluxo de enriquecimento</strong> (Google, CNPJ…) é escolhido no produto ou em{" "}
        <Link href="/admin/fluxos-geracao">Fluxos de geração</Link>; parâmetros técnicos ANP em{" "}
        <Link href="/admin/anp-variaveis">Variáveis ANP</Link>.
      </PageIntro>

      <AdminLeadMotorSegments />
    </div>
  );
}
