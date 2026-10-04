"use client";

import clsx from "clsx";
import { ChevronDown, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ClientContactShortcuts,
  type ContactDialOption
} from "@/components/client-contact-shortcuts";
import {
  LeadQualificationBadge,
  LeadQualificationPicker
} from "@/components/lead-qualification-picker";
import type { LeadQualification } from "@/lib/lead-qualification";

function HeaderMetaEdit({
  label,
  value,
  panel,
  panelLabel
}: {
  label: ReactNode;
  value: ReactNode;
  panel: ReactNode;
  panelLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="client-detail-header__meta-row" ref={rootRef}>
      <span className="client-detail-header__meta-text">
        <span className="muted">{label}: </span>
        {value}
      </span>
      <div className="client-detail-header__meta-edit">
        <button
          type="button"
          className="btn btn-icon-sm client-detail-header__edit-btn"
          aria-expanded={open}
          aria-controls={panelId}
          title={panelLabel}
          aria-label={panelLabel}
          onClick={() => setOpen((v) => !v)}
        >
          <Pencil size={14} aria-hidden />
        </button>
        {open ? (
          <div id={panelId} className="client-detail-header__edit-popover panel" role="dialog" aria-label={panelLabel}>
            {panel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ClientDetailHeader({
  clientDisplayName,
  isExistingCustomer,
  savingExistingCustomer,
  onChangeExistingCustomer,
  inProspeccao,
  leadQualification,
  savingQualification,
  onChangeLeadQualification,
  bdrName,
  contactShortcuts,
  engagementContextLabel,
  onRegisterApproach,
  onScheduleContact,
  onScheduleMeeting,
  onNewOpportunity,
  onEnrollProspeccao,
  canReconsult,
  onReconsult,
  onDeleteClient,
  deletingClient
}: {
  clientDisplayName: string;
  isExistingCustomer: boolean;
  savingExistingCustomer: boolean;
  onChangeExistingCustomer: (next: boolean) => void;
  inProspeccao: boolean;
  leadQualification: LeadQualification;
  savingQualification: boolean;
  onChangeLeadQualification: (next: LeadQualification) => void;
  bdrName: string | null;
  contactShortcuts: {
    clientName: string;
    contactName?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    productId?: number;
    productName?: string | null;
    clientId: number;
    contactId?: number;
    dialOptions?: ContactDialOption[];
    resolveEngagement?: () => Promise<{ productId?: number | null; productName?: string | null } | void>;
  };
  engagementContextLabel?: string | null;
  onRegisterApproach: () => void;
  onScheduleContact: () => void;
  onScheduleMeeting: () => void;
  onNewOpportunity: () => void;
  onEnrollProspeccao?: () => void;
  canReconsult?: boolean;
  onReconsult?: () => void;
  onDeleteClient?: () => void;
  deletingClient?: boolean;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsMenuId = useId();

  useEffect(() => {
    if (!actionsOpen) return;
    function onDoc(e: MouseEvent) {
      if (!actionsRef.current?.contains(e.target as Node)) setActionsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActionsOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen]);

  function runAction(fn: () => void) {
    setActionsOpen(false);
    fn();
  }

  return (
    <header className="client-detail-header">
      <div className="client-detail-header__main">
        <h1 className="client-detail-header__name">{clientDisplayName}</h1>
        {engagementContextLabel ? (
          <p className="client-detail-header__engagement-context muted">{engagementContextLabel}</p>
        ) : null}
        <div className="client-detail-header__meta">
          <HeaderMetaEdit
            label="Já é cliente"
            panelLabel="Alterar se já é cliente"
            value={<strong>{isExistingCustomer ? "Sim" : "Não"}</strong>}
            panel={
              <div className="client-detail-header__qual-panel">
                <p className="muted client-detail-header__qual-hint">Marque manualmente quando o posto já for cliente.</p>
                <div className="client-detail-header__yes-no">
                  <button
                    type="button"
                    className={clsx("btn btn-sm", !isExistingCustomer && "btn-primary")}
                    disabled={savingExistingCustomer || !isExistingCustomer}
                    onClick={() => onChangeExistingCustomer(false)}
                  >
                    Não
                  </button>
                  <button
                    type="button"
                    className={clsx("btn btn-sm", isExistingCustomer && "btn-primary")}
                    disabled={savingExistingCustomer || isExistingCustomer}
                    onClick={() => onChangeExistingCustomer(true)}
                  >
                    Sim
                  </button>
                </div>
              </div>
            }
          />
          <p className="client-detail-header__meta-row client-detail-header__meta-row--plain">
            <span className="muted">Em prospecção: </span>
            <strong>{inProspeccao ? "Sim" : "Não"}</strong>
          </p>
          <HeaderMetaEdit
            label="Qualificação do lead"
            panelLabel="Alterar qualificação do lead"
            value={<LeadQualificationBadge value={leadQualification} />}
            panel={
              <LeadQualificationPicker
                value={leadQualification}
                onChange={onChangeLeadQualification}
                disabled={savingQualification}
                compact
                showCurrentLabel={false}
              />
            }
          />
        </div>
      </div>

      <div className="client-detail-header__aside">
        <div className="client-detail-header__aside-row">
          <span className="client-detail-header__aside-label">Contato</span>
          <ClientContactShortcuts {...contactShortcuts} size="md" />
        </div>
        <div className="client-detail-header__aside-row client-detail-header__actions-row" ref={actionsRef}>
          <span className="client-detail-header__aside-label">Ações</span>
          <div className="client-detail-header__actions-wrap">
            <button
              type="button"
              className={clsx("btn client-detail-header__actions-trigger", actionsOpen && "is-open")}
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              aria-controls={actionsMenuId}
              onClick={() => setActionsOpen((o) => !o)}
            >
              Escolher ação
              <ChevronDown size={16} aria-hidden className="client-detail-header__actions-chevron" />
            </button>
            {actionsOpen ? (
              <ul id={actionsMenuId} className="client-detail-header__actions-menu panel" role="menu">
                <li role="none">
                  <button type="button" role="menuitem" className="client-detail-header__actions-item" onClick={() => runAction(onRegisterApproach)}>
                    Registrar abordagem
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" className="client-detail-header__actions-item" onClick={() => runAction(onScheduleContact)}>
                    Agendar contato
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" className="client-detail-header__actions-item" onClick={() => runAction(onScheduleMeeting)}>
                    Agendar reunião
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" className="client-detail-header__actions-item" onClick={() => runAction(onNewOpportunity)}>
                    Nova oportunidade
                  </button>
                </li>
                {!inProspeccao && onEnrollProspeccao ? (
                  <li role="none">
                    <button type="button" role="menuitem" className="client-detail-header__actions-item" onClick={() => runAction(onEnrollProspeccao)}>
                      Colocar em prospecção
                    </button>
                  </li>
                ) : null}
                {canReconsult && onReconsult ? (
                  <li role="none">
                    <button type="button" role="menuitem" className="client-detail-header__actions-item" onClick={() => runAction(onReconsult)}>
                      <RefreshCw size={14} aria-hidden /> Reconsultar dados
                    </button>
                  </li>
                ) : null}
                {canReconsult && onDeleteClient ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="client-detail-header__actions-item client-detail-header__actions-item--danger"
                      disabled={deletingClient}
                      onClick={() => runAction(onDeleteClient)}
                    >
                      <Trash2 size={14} aria-hidden /> Excluir cliente
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
        <p className="client-detail-header__aside-row client-detail-header__bdr-row">
          <span className="client-detail-header__aside-label">BDR</span>
          <span className="client-detail-header__bdr-value">{bdrName?.trim() || "—"}</span>
        </p>
      </div>
    </header>
  );
}
