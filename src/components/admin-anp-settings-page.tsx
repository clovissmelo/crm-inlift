"use client";

import { AdminAnpParametersSettings } from "@/components/admin-anp-variables";
import { AdminLeadMotorSegments } from "@/components/admin-lead-motor-segments";
import { PageIntro } from "@/components/page-intro";
import Link from "next/link";

export function AdminAnpSettingsPage() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Configuração da <strong>ANP</strong> no CRM: <strong>segmentos</strong> (tipo de posto e filtro na base de
        revendedores, usados em Novos leads e Produtos), <strong>simulação</strong>, provedor do motor e notas das fontes
        públicas. O <strong>fluxo de enriquecimento</strong> (Google, CNPJ…) fica em{" "}
        <Link href="/admin/fluxos-geracao">Fluxos de geração</Link>.
      </PageIntro>

      <AdminLeadMotorSegments />

      <div style={{ marginTop: "1.5rem" }}>
        <AdminAnpParametersSettings />
      </div>
    </div>
  );
}
