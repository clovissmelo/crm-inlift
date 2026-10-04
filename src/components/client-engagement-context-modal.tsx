"use client";

import { CadastroModal } from "@/components/cadastro-ui";
import { formatOpportunityContextLabel } from "@/lib/engagement-context";
import type { ClientEngagementContext } from "@/lib/engagement-context";

export type ClientOpportunityOption = {
  id: number;
  product_id: number;
  product_name: string;
  title: string;
  outcome: string;
  owner_user_id: number | null;
  owner_name: string | null;
};

export function ClientEngagementContextModal({
  open,
  actionLabel,
  opportunities,
  onClose,
  onChoose,
  onCreateOpportunity
}: {
  open: boolean;
  actionLabel: string;
  opportunities: ClientOpportunityOption[];
  onClose: () => void;
  onChoose: (ctx: ClientEngagementContext) => void;
  onCreateOpportunity: () => void;
}) {
  const openOpps = opportunities.filter((o) => o.outcome === "open");

  return (
    <CadastroModal open={open} title="Contexto do contato" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.875rem" }}>
        Para <strong>{actionLabel}</strong>, informe se é um contato geral do cliente ou ligado a uma oportunidade (linha
        de prospecção por produto).
      </p>
      <div className="engagement-context-options">
        <button
          type="button"
          className="engagement-context-option"
          onClick={() =>
            onChoose({
              kind: "related",
              productId: null,
              opportunityId: null,
              label: "Contato relacionado"
            })
          }
        >
          <strong>Contato relacionado</strong>
          <span className="muted">Sem produto/oportunidade — cadastro, dúvidas gerais, etc.</span>
        </button>
        {openOpps.map((o) => (
          <button
            key={o.id}
            type="button"
            className="engagement-context-option"
            onClick={() =>
              onChoose({
                kind: "opportunity",
                productId: o.product_id,
                opportunityId: o.id,
                productName: o.product_name,
                ownerUserId: o.owner_user_id,
                label: formatOpportunityContextLabel(o.product_name)
              })
            }
          >
            <strong>{formatOpportunityContextLabel(o.product_name)}</strong>
            <span className="muted">
              {o.title.trim() || "Sem título"}
              {o.owner_name ? ` · BDR: ${o.owner_name}` : ""}
            </span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="button" className="btn" onClick={onCreateOpportunity}>
          Nova oportunidade…
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </CadastroModal>
  );
}
