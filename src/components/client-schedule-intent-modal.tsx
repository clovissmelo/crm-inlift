"use client";

import { Briefcase, Phone, User, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { ClientOpportunityOption } from "@/components/client-engagement-context-modal";
import { formatOpportunityContextLabel } from "@/lib/engagement-context";
import type { ClientEngagementContext } from "@/lib/engagement-context";

export type ScheduleIntent = "schedule" | "meeting";

type LinkChoice = "client" | number;

export function ClientScheduleIntentModal({
  open,
  clientDisplayName,
  opportunities,
  onClose,
  onContinue,
  onCreateOpportunity
}: {
  open: boolean;
  clientDisplayName: string;
  opportunities: ClientOpportunityOption[];
  onClose: () => void;
  onContinue: (intent: ScheduleIntent, ctx: ClientEngagementContext) => void;
  onCreateOpportunity: () => void;
}) {
  const openOpps = opportunities.filter(
    (o) => o.outcome === "open" && (o.engagement_status ?? "active") === "active"
  );
  const [scheduleType, setScheduleType] = useState<ScheduleIntent>("meeting");
  const [link, setLink] = useState<LinkChoice>("client");

  useEffect(() => {
    if (open) {
      setScheduleType("meeting");
      setLink("client");
    }
  }, [open]);

  function buildContext(): ClientEngagementContext {
    if (link === "client") {
      return {
        kind: "related",
        productId: null,
        opportunityId: null,
        label: "Contato relacionado"
      };
    }
    const o = openOpps.find((x) => x.id === link);
    if (!o) {
      return {
        kind: "related",
        productId: null,
        opportunityId: null,
        label: "Contato relacionado"
      };
    }
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
    onContinue(scheduleType, buildContext());
  }

  return (
    <CadastroModal
      open={open}
      title="O que você deseja agendar?"
      onClose={onClose}
      wide
      panelClassName="engagement-flow-modal"
    >
      <p className="engagement-flow-modal__client muted">{clientDisplayName}</p>

      <div className="engagement-flow-section">
        <p className="engagement-flow-section__title">Tipo de agendamento</p>
        <p className="engagement-flow-section__desc muted">Escolha o tipo de interação com o cliente.</p>
        <ul className="engagement-flow-cards engagement-flow-cards--row">
          <li>
            <button
              type="button"
              className={`engagement-flow-card${scheduleType === "schedule" ? " is-selected" : ""}`}
              onClick={() => setScheduleType("schedule")}
            >
              <span className="engagement-flow-card__icon" aria-hidden>
                <Phone size={20} />
              </span>
              <span className="engagement-flow-card__body">
                <strong>Contato</strong>
                <span className="muted">Retorno por telefone, WhatsApp ou e-mail.</span>
              </span>
              <span className={`engagement-flow-card__radio${scheduleType === "schedule" ? " is-on" : ""}`} aria-hidden />
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`engagement-flow-card${scheduleType === "meeting" ? " is-selected" : ""}`}
              onClick={() => setScheduleType("meeting")}
            >
              <span className="engagement-flow-card__icon" aria-hidden>
                <Video size={20} />
              </span>
              <span className="engagement-flow-card__body">
                <strong>Reunião</strong>
                <span className="muted">Encontro com o cliente e os envolvidos.</span>
              </span>
              <span className={`engagement-flow-card__radio${scheduleType === "meeting" ? " is-on" : ""}`} aria-hidden />
            </button>
          </li>
        </ul>
      </div>

      <div className="engagement-flow-section">
        <p className="engagement-flow-section__title">Vincular a</p>
        <p className="engagement-flow-section__desc muted">Escolha onde registrar este agendamento.</p>
        <ul className="engagement-flow-cards">
          <li>
            <button
              type="button"
              className={`engagement-flow-card${link === "client" ? " is-selected" : ""}`}
              onClick={() => setLink("client")}
            >
              <span className="engagement-flow-card__icon" aria-hidden>
                <User size={20} />
              </span>
              <span className="engagement-flow-card__body">
                <strong>Cliente</strong>
                <span className="muted">Assunto geral, sem vínculo com uma oportunidade.</span>
              </span>
              <span className={`engagement-flow-card__radio${link === "client" ? " is-on" : ""}`} aria-hidden />
            </button>
          </li>
          {openOpps.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`engagement-flow-card${link === o.id ? " is-selected" : ""}`}
                onClick={() => setLink(o.id)}
              >
                <span className="engagement-flow-card__icon" aria-hidden>
                  <Briefcase size={20} />
                </span>
                <span className="engagement-flow-card__body">
                  <strong>Oportunidade</strong>
                  <span className="muted">Relacionar a uma negociação de produto ({o.product_name}).</span>
                </span>
                <span className={`engagement-flow-card__radio${link === o.id ? " is-on" : ""}`} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {openOpps.length === 0 ? (
          <p className="engagement-flow-empty muted">
            Este cliente ainda não possui oportunidades.{" "}
            <button type="button" className="engagement-flow-link" onClick={onCreateOpportunity}>
              + Criar oportunidade
            </button>
          </p>
        ) : null}
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
