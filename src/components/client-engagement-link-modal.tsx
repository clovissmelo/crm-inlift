"use client";

import { Briefcase, User } from "lucide-react";
import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { formatOpportunityContextLabel } from "@/lib/engagement-context";
import type { ClientEngagementContext } from "@/lib/engagement-context";
import type { ClientOpportunityOption } from "@/components/client-engagement-context-modal";

type LinkChoice = "client" | number;

export function ClientEngagementLinkModal({
  open,
  title,
  clientDisplayName,
  actionHint,
  opportunities,
  onClose,
  onContinue,
  onCreateOpportunity
}: {
  open: boolean;
  title: string;
  clientDisplayName: string;
  actionHint: string;
  opportunities: ClientOpportunityOption[];
  onClose: () => void;
  onContinue: (ctx: ClientEngagementContext) => void;
  onCreateOpportunity: () => void;
}) {
  const openOpps = opportunities.filter((o) => o.outcome === "open");
  const [choice, setChoice] = useState<LinkChoice>("client");

  useEffect(() => {
    if (open) setChoice("client");
  }, [open]);

  function buildContext(): ClientEngagementContext | null {
    if (choice === "client") {
      return {
        kind: "related",
        productId: null,
        opportunityId: null,
        label: "Contato relacionado"
      };
    }
    const o = openOpps.find((x) => x.id === choice);
    if (!o) return null;
    return {
      kind: "opportunity",
      productId: o.product_id,
      opportunityId: o.id,
      productName: o.product_name,
      ownerUserId: o.owner_user_id,
      label: formatOpportunityContextLabel(o.product_name)
    };
  }

  function submit() {
    const ctx = buildContext();
    if (!ctx) return;
    onContinue(ctx);
  }

  return (
    <CadastroModal open={open} title={title} onClose={onClose} wide panelClassName="engagement-flow-modal">
      <p className="engagement-flow-modal__client muted">{clientDisplayName}</p>
      <p className="engagement-flow-modal__hint muted">{actionHint}</p>

      <div className="engagement-flow-section">
        <p className="engagement-flow-section__title">Vincular a</p>
        <p className="engagement-flow-section__desc muted">Escolha onde registrar este contato.</p>
        <ul className="engagement-flow-cards">
          <li>
            <button
              type="button"
              className={`engagement-flow-card${choice === "client" ? " is-selected" : ""}`}
              onClick={() => setChoice("client")}
            >
              <span className="engagement-flow-card__icon" aria-hidden>
                <User size={20} />
              </span>
              <span className="engagement-flow-card__body">
                <strong>Cliente</strong>
                <span className="muted">Assunto geral, sem vínculo com uma oportunidade.</span>
              </span>
              <span className={`engagement-flow-card__radio${choice === "client" ? " is-on" : ""}`} aria-hidden />
            </button>
          </li>
          {openOpps.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`engagement-flow-card${choice === o.id ? " is-selected" : ""}`}
                onClick={() => setChoice(o.id)}
              >
                <span className="engagement-flow-card__icon" aria-hidden>
                  <Briefcase size={20} />
                </span>
                <span className="engagement-flow-card__body">
                  <strong>Oportunidade</strong>
                  <span className="muted">
                    {formatOpportunityContextLabel(o.product_name)} — {o.title.trim() || "Sem título"}
                    {o.owner_name ? ` · BDR: ${o.owner_name}` : ""}
                  </span>
                </span>
                <span className={`engagement-flow-card__radio${choice === o.id ? " is-on" : ""}`} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {openOpps.length === 0 ? (
          <p className="engagement-flow-empty muted">
            Este cliente ainda não possui oportunidades abertas.{" "}
            <button type="button" className="engagement-flow-link" onClick={onCreateOpportunity}>
              + Criar oportunidade
            </button>
          </p>
        ) : (
          <button type="button" className="engagement-flow-link" onClick={onCreateOpportunity}>
            + Criar oportunidade
          </button>
        )}
      </div>

      <div className="engagement-flow-modal__foot">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={submit}>
          Continuar →
        </button>
      </div>
    </CadastroModal>
  );
}
