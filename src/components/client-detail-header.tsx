"use client";

import clsx from "clsx";
import { CalendarPlus, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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

function QualificationEdit({
  leadQualification,
  savingQualification,
  onChangeLeadQualification
}: {
  leadQualification: LeadQualification;
  savingQualification: boolean;
  onChangeLeadQualification: (next: LeadQualification) => void;
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
    <div className="client-detail-header__qual-edit" ref={rootRef}>
      <LeadQualificationBadge value={leadQualification} />
      <button
        type="button"
        className="btn btn-icon-sm client-detail-header__edit-btn"
        aria-expanded={open}
        aria-controls={panelId}
        title="Alterar qualificação do lead"
        aria-label="Alterar qualificação do lead"
        onClick={() => setOpen((v) => !v)}
      >
        <Pencil size={14} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="client-detail-header__edit-popover panel" role="dialog" aria-label="Alterar qualificação">
          <LeadQualificationPicker
            value={leadQualification}
            onChange={onChangeLeadQualification}
            disabled={savingQualification}
            compact
            showCurrentLabel={false}
          />
        </div>
      ) : null}
    </div>
  );
}

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
    <div className="client-detail-header__chip" ref={rootRef}>
      <span className="client-detail-header__chip-label muted">{label}</span>
      <span className="client-detail-header__chip-value">{value}</span>
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
  );
}

export function ClientDetailHeader({
  clientDisplayName,
  legalName,
  isExistingCustomer,
  savingExistingCustomer,
  onChangeExistingCustomer,
  inProspeccao,
  leadQualification,
  savingQualification,
  onChangeLeadQualification,
  bdrName,
  linkedProducts,
  onAssociateProduct,
  contactShortcuts,
  onRegisterApproach,
  onSchedule,
  onNewOpportunity,
  onEnrollProspeccao,
  canReconsult,
  onReconsult,
  onDeleteClient,
  deletingClient
}: {
  clientDisplayName: string;
  legalName: string | null;
  isExistingCustomer: boolean;
  savingExistingCustomer: boolean;
  onChangeExistingCustomer: (next: boolean) => void;
  inProspeccao: boolean;
  leadQualification: LeadQualification;
  savingQualification: boolean;
  onChangeLeadQualification: (next: LeadQualification) => void;
  bdrName: string | null;
  linkedProducts: Array<{ product_id: number; name: string }>;
  onAssociateProduct: () => void;
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
  onRegisterApproach: () => void;
  onSchedule: () => void;
  onNewOpportunity: () => void;
  onEnrollProspeccao?: () => void;
  canReconsult?: boolean;
  onReconsult?: () => void;
  onDeleteClient?: () => void;
  deletingClient?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreMenuId = useId();

  useEffect(() => {
    if (!moreOpen) return;
    function onDoc(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  const subtitle = legalName?.trim() && legalName.trim() !== clientDisplayName ? legalName.trim() : null;

  return (
    <header className="client-detail-header client-detail-header--v2">
      <div className="client-detail-header__top">
        <div className="client-detail-header__title-block">
          <div className="client-detail-header__title-row">
            <h1 className="client-detail-header__name">{clientDisplayName}</h1>
            <QualificationEdit
              leadQualification={leadQualification}
              savingQualification={savingQualification}
              onChangeLeadQualification={onChangeLeadQualification}
            />
          </div>
          {subtitle ? <p className="client-detail-header__legal muted">{subtitle}</p> : null}
        </div>
        <div className="client-detail-header__primary-actions">
          <button type="button" className="btn btn-primary" onClick={onRegisterApproach}>
            <Plus size={16} aria-hidden /> Registrar
          </button>
          <button type="button" className="btn btn-primary" onClick={onSchedule}>
            <CalendarPlus size={16} aria-hidden /> Agendar
          </button>
          {canReconsult && onReconsult ? (
            <button type="button" className="btn btn-icon-md" title="Reconsultar dados" aria-label="Reconsultar dados" onClick={onReconsult}>
              <RefreshCw size={18} aria-hidden />
            </button>
          ) : null}
          {canReconsult && onDeleteClient ? (
            <button
              type="button"
              className="btn btn-icon-md btn-danger-outline"
              title="Excluir cliente"
              aria-label="Excluir cliente"
              disabled={deletingClient}
              onClick={onDeleteClient}
            >
              <Trash2 size={18} aria-hidden />
            </button>
          ) : null}
          <div className="client-detail-header__more-wrap" ref={moreRef}>
            <button
              type="button"
              className={clsx("btn btn-icon-md", moreOpen && "is-open")}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-controls={moreMenuId}
              title="Mais ações"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
            {moreOpen ? (
              <ul id={moreMenuId} className="client-detail-header__more-menu panel" role="menu">
                <li role="none">
                  <button type="button" role="menuitem" className="client-detail-header__more-item" onClick={() => { setMoreOpen(false); onNewOpportunity(); }}>
                    Nova oportunidade
                  </button>
                </li>
                {onEnrollProspeccao ? (
                  <li role="none">
                    <button type="button" role="menuitem" className="client-detail-header__more-item" onClick={() => { setMoreOpen(false); onEnrollProspeccao(); }}>
                      Colocar em prospecção
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <div className="client-detail-header__status-row">
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
        <div className="client-detail-header__chip client-detail-header__chip--plain">
          <span className="client-detail-header__chip-label muted">Em prospecção</span>
          <span className={clsx("client-detail-header__badge", inProspeccao && "client-detail-header__badge--on")}>
            {inProspeccao ? "Sim" : "Não"}
          </span>
        </div>
        {bdrName?.trim() ? (
          <div className="client-detail-header__chip client-detail-header__chip--plain">
            <span className="client-detail-header__chip-label muted">BDR</span>
            <span className="client-detail-header__chip-value">{bdrName}</span>
          </div>
        ) : null}
      </div>

      <div className="client-detail-header__contact-row">
        <ClientContactShortcuts {...contactShortcuts} size="md" />
        <div className="client-detail-header__products">
          <span className="muted client-detail-header__products-label">Produtos associados</span>
          <div className="client-detail-header__product-tags">
            {linkedProducts.length === 0 ? (
              <span className="muted">Nenhum</span>
            ) : (
              linkedProducts.map((p) => (
                <span key={p.product_id} className="client-detail-header__product-tag">
                  {p.name}
                </span>
              ))
            )}
            <button type="button" className="btn btn-sm" onClick={onAssociateProduct}>
              + Associar
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
