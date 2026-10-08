"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Phone, Mail, MessageCircle, Smartphone } from "lucide-react";
import { API4COM_NO_EXTENSION_MESSAGE, type Api4comDialIdentity } from "@/lib/api4com/dial-identity-shared";
import type { ContactVerification } from "@/lib/types";
import { WhatsAppTemplateModal } from "@/components/whatsapp-template-modal";
import { CadastroModal } from "@/components/cadastro-ui";
import { useApi4comSession, useApi4comWebphone } from "@/components/api4com-call-provider";
import { apiErrorText } from "@/lib/api-error-text";
import { EmailApproachModal } from "@/components/email-approach-modal";
import type { PhoneDialContextItem } from "@/lib/call-strategy/eligible-phones";
import {
  DIAL_PICKER_RECENT_CALLS,
  dialPickerStatusLine,
  formatDialPickerCallTime,
  sortDialHistoryNewestFirst
} from "@/lib/call-strategy/dial-picker-display";
import { telLink, formatPhoneDisplay, isMobileBr, phoneDigits } from "@/lib/format";

export type ContactDialOption = {
  contactId?: number;
  contactName?: string | null;
  phone: string;
  label?: string;
  verification_status?: ContactVerification;
  clientPhoneId?: number;
  position?: number;
  total?: number;
  status?: string;
  eligibleNow?: boolean;
  counterLine?: string | null;
  counterLines?: string[];
  attemptLabel?: string;
  origin?: string;
  cycleNoContactCount?: number;
  nextEligibleAt?: string | null;
  needsReview?: boolean;
  pendingRegistrationCalls?: number;
  attemptsAtLimit?: boolean;
  dialHistoryAt?: string[];
  maxDialAttempts?: number;
};

function contactOptionsFromDialStrategy(phones: PhoneDialContextItem[]): ContactDialOption[] {
  return [...phones]
    .sort((a, b) => a.sort_order - b.sort_order || a.client_phone_id - b.client_phone_id)
    .map((p) => ({
      clientPhoneId: p.client_phone_id,
      contactId: p.primary_contact_id ?? undefined,
      phone: p.phone_display || p.phone,
      label: p.origin,
      attemptLabel: p.attempt_label,
      position: p.position,
      total: p.total,
      status: p.status,
      eligibleNow: p.eligible_now,
      counterLine: p.counter_line,
      counterLines: p.counter_lines,
      origin: p.origin,
      cycleNoContactCount: p.cycle_no_contact_count,
      nextEligibleAt: p.next_eligible_at,
      needsReview: p.needs_review,
      pendingRegistrationCalls: p.pending_registration_calls,
      attemptsAtLimit: p.attempts_at_limit,
      dialHistoryAt: p.dial_history_at,
      maxDialAttempts: p.max_dial_attempts
    }));
}

function dialOptionAtCallLimit(o: ContactDialOption): boolean {
  if (o.attemptsAtLimit) return true;
  const limit = o.maxDialAttempts ?? 3;
  const count = o.dialHistoryAt?.length ?? o.cycleNoContactCount ?? 0;
  return count >= limit && limit > 0;
}

function dialPhoneKindLabel(phone: string): { kind: "mobile" | "landline"; label: string } {
  const digits = phoneDigits(phone);
  if (isMobileBr(digits)) return { kind: "mobile", label: "Celular" };
  return { kind: "landline", label: "Fixo" };
}

function dialOptionSortRank(o: ContactDialOption): number {
  const status = o.verification_status ?? "unverified";
  if (status === "confirmed") return 0;
  if (status === "invalid_number" || status === "wrong_contact") return 100;
  const digits = phoneDigits(o.phone);
  if (status === "unverified" && isMobileBr(digits)) return 10;
  if (status === "unverified") return 20;
  return 30;
}

export function sortContactDialOptions(options: ContactDialOption[]): ContactDialOption[] {
  return [...options].sort((a, b) => {
    const diff = dialOptionSortRank(a) - dialOptionSortRank(b);
    if (diff !== 0) return diff;
    return formatPhoneDisplay(a.phone).localeCompare(formatPhoneDisplay(b.phone), "pt-BR");
  });
}

function buildDialOptions(input: {
  phone?: string | null;
  whatsapp?: string | null;
  contactId?: number;
  contactName?: string | null;
  dialOptions?: ContactDialOption[];
}): ContactDialOption[] {
  if (input.dialOptions?.length) {
    return input.dialOptions.filter((o) => o.phone?.trim());
  }
  const opts: ContactDialOption[] = [];
  if (input.phone?.trim()) {
    opts.push({
      contactId: input.contactId,
      contactName: input.contactName,
      phone: input.phone,
      label: "Telefone"
    });
  }
  if (input.whatsapp?.trim() && input.whatsapp !== input.phone) {
    opts.push({
      contactId: input.contactId,
      contactName: input.contactName,
      phone: input.whatsapp,
      label: "Telefone adicional"
    });
  }
  return opts;
}

export function ClientContactShortcuts({
  clientName,
  contactName,
  phone,
  whatsapp,
  email,
  productId,
  productName,
  clientId,
  contactId,
  dialOptions,
  size = "sm",
  className,
  resolveEngagement
}: {
  clientName: string;
  contactName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  productId?: number;
  productName?: string | null;
  clientId?: number;
  contactId?: number;
  dialOptions?: ContactDialOption[];
  size?: "sm" | "md";
  className?: string;
  /** Abre seletor de contexto (relacionado vs oportunidade) antes de ligar / WhatsApp / e-mail. */
  resolveEngagement?: () => Promise<{ productId?: number | null; productName?: string | null } | void>;
}) {
  const api4com = useApi4comSession();
  const webphone = useApi4comWebphone();
  const [waOpen, setWaOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [identityPickerOpen, setIdentityPickerOpen] = useState(false);
  const [noExtensionOpen, setNoExtensionOpen] = useState(false);
  const [dialIdentities, setDialIdentities] = useState<Api4comDialIdentity[]>([]);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [dialAsUserId, setDialAsUserId] = useState<number | null>(null);
  const [dialFeedbackOpen, setDialFeedbackOpen] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [dialError, setDialError] = useState<string | null>(null);
  const [pickerOptions, setPickerOptions] = useState<ContactDialOption[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [expandedDialHistory, setExpandedDialHistory] = useState<Set<string>>(() => new Set());
  const [pendingEngagementProductId, setPendingEngagementProductId] = useState<number | null | undefined>(undefined);

  const waNumber = whatsapp || phone;
  const hasEmail = Boolean(email?.trim());
  const btnClass = size === "sm" ? "btn btn-icon-sm" : "btn btn-icon-md";
  const iconSize = size === "sm" ? 16 : 20;

  const options = useMemo(
    () => sortContactDialOptions(buildDialOptions({ phone, whatsapp, contactId, contactName, dialOptions })),
    [phone, whatsapp, contactId, contactName, dialOptions]
  );
  const useApi4com = Boolean(api4com?.canDial && clientId);

  function resolvedDialAsUserId(): number | null {
    if (!api4com) return null;
    if (api4com.hasOwnExtension) return api4com.userId;
    return dialAsUserId;
  }

  async function startCall(
    option: ContactDialOption,
    fromPicker: boolean,
    asUserId?: number | null,
    engagementProductId?: number | null
  ) {
    if (!clientId || !api4com) return;
    const dialAs = asUserId ?? resolvedDialAsUserId();
    if (!dialAs) return;
    if (webphone) {
      const online = await webphone.prepareForApiDial({ userId: dialAs, openPanel: true });
      if (!online) {
        setDialError("Conecte o ramal no painel de telefonia do CRM antes de ligar.");
        if (!fromPicker) setDialFeedbackOpen(true);
        return;
      }
    }
    setDialing(true);
    setDialError(null);
    const payload: Record<string, unknown> = {
      client_id: clientId,
      contact_id: option.contactId ?? contactId ?? null,
      product_id: engagementProductId ?? productId ?? null,
      phone: option.phone
    };
    if (dialAs !== api4com.userId) payload.dial_as_user_id = dialAs;
    const res = await fetch("/api/api4com/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    setDialing(false);
    if (!res.ok) {
      setDialError(apiErrorText(data, "Não foi possível iniciar a ligação."));
      if (!fromPicker) setDialFeedbackOpen(true);
      return;
    }
    setPickerOpen(false);
    setDialFeedbackOpen(false);
    setDialError(null);
  }

  function closePicker() {
    setPickerOpen(false);
    setDialError(null);
    setPickerOptions([]);
    setPickerLoading(false);
    setExpandedDialHistory(new Set());
  }

  function dialHistoryKey(o: ContactDialOption, index: number): string {
    return String(o.clientPhoneId ?? o.contactId ?? o.phone ?? index);
  }

  function toggleDialHistoryExpanded(key: string) {
    setExpandedDialHistory((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function closeIdentityPicker() {
    setIdentityPickerOpen(false);
    setDialError(null);
  }

  function closeNoExtension() {
    setNoExtensionOpen(false);
  }

  function closeDialFeedback() {
    setDialFeedbackOpen(false);
    setDialError(null);
  }

  async function proceedToPhonePicker(asUserId: number, engagementProductId?: number | null) {
    setPendingEngagementProductId(engagementProductId);
    setDialAsUserId(asUserId);
    setDialError(null);
    setPickerOpen(true);
    setPickerLoading(true);
    setPickerOptions([]);
    try {
      let list = options;
      if (clientId) {
        const res = await fetch(`/api/clients/${clientId}/dial-phones`);
        if (res.ok) {
          const j = (await res.json()) as { phones?: PhoneDialContextItem[] };
          const fromStrategy = contactOptionsFromDialStrategy(j.phones ?? []);
          if (fromStrategy.length) list = fromStrategy;
        }
      }
      const sorted = sortContactDialOptions(list);
      setPickerOptions(sorted);
      if (sorted.length === 0) {
        setDialError("Nenhum telefone cadastrado para este lead.");
      }
    } catch {
      const fallback = sortContactDialOptions(options);
      setPickerOptions(fallback);
      setDialError(
        fallback.length
          ? "Não foi possível atualizar os contadores; números abaixo podem estar desatualizados."
          : "Não foi possível carregar os telefones."
      );
    } finally {
      setPickerLoading(false);
    }
  }

  async function openAdminIdentityPicker(engagementProductId?: number | null) {
    setPendingEngagementProductId(engagementProductId);
    setIdentityLoading(true);
    setDialError(null);
    setIdentityPickerOpen(true);
    try {
      const res = await fetch("/api/api4com/dial-identities");
      const data = (await res.json()) as { items?: Api4comDialIdentity[]; error?: string };
      if (!res.ok) {
        setDialError(data.error ?? "Não foi possível carregar usuários com ramal.");
        setDialIdentities([]);
        return;
      }
      setDialIdentities(data.items ?? []);
    } catch {
      setDialError("Não foi possível carregar usuários com ramal.");
      setDialIdentities([]);
    } finally {
      setIdentityLoading(false);
    }
  }

  async function resolveEngagementProductId(): Promise<number | null | undefined> {
    if (!resolveEngagement) return undefined;
    const r = await resolveEngagement();
    return r?.productId ?? null;
  }

  async function openWhatsApp() {
    const pid = await resolveEngagementProductId();
    setPendingEngagementProductId(pid);
    setWaOpen(true);
  }

  async function openEmail() {
    const pid = await resolveEngagementProductId();
    setPendingEngagementProductId(pid);
    setEmailOpen(true);
  }

  async function onCallClick() {
    if (!useApi4com || !api4com) return;
    setDialError(null);
    setDialFeedbackOpen(false);
    const engagementProductId = await resolveEngagementProductId();
    const runDial = (asUserId: number) => {
      void proceedToPhonePicker(asUserId, engagementProductId);
    };
    if (api4com.hasOwnExtension) {
      runDial(api4com.userId);
      return;
    }
    if (api4com.isAdmin) {
      void openAdminIdentityPicker(engagementProductId);
      return;
    }
    setNoExtensionOpen(true);
  }

  function onIdentityPicked(identity: Api4comDialIdentity) {
    setIdentityPickerOpen(false);
    void proceedToPhonePicker(identity.id);
  }

  const tel =
    !useApi4com && options[0]?.phone ? telLink(options[0].phone) : !useApi4com && waNumber ? telLink(waNumber) : null;

  return (
    <>
      <div className={clsx("contact-shortcuts", className)} onClick={(e) => e.stopPropagation()}>
        {useApi4com ? (
          <button
            type="button"
            className={btnClass}
            title="Ligar via API4COM"
            aria-label="Ligar via API4COM"
            disabled={dialing}
            onClick={onCallClick}
          >
            <Phone size={iconSize} />
          </button>
        ) : tel ? (
          <a className={btnClass} href={tel} title="Ligar" aria-label="Ligar">
            <Phone size={iconSize} />
          </a>
        ) : (
          <span className={`${btnClass} disabled`} title="Sem telefone" aria-hidden>
            <Phone size={iconSize} />
          </span>
        )}
        {waNumber ? (
          <button
            type="button"
            className={btnClass}
            title="WhatsApp"
            aria-label="WhatsApp"
            onClick={() => void openWhatsApp()}
          >
            <MessageCircle size={iconSize} />
          </button>
        ) : (
          <span className={`${btnClass} disabled`} title="Sem WhatsApp" aria-hidden>
            <MessageCircle size={iconSize} />
          </span>
        )}
        {hasEmail ? (
          <button type="button" className={btnClass} title="E-mail" aria-label="E-mail" onClick={() => void openEmail()}>
            <Mail size={iconSize} />
          </button>
        ) : (
          <span className={`${btnClass} disabled`} title="Sem e-mail" aria-hidden>
            <Mail size={iconSize} />
          </span>
        )}
      </div>
      {waNumber ? (
        <WhatsAppTemplateModal
          open={waOpen}
          onClose={() => setWaOpen(false)}
          phone={waNumber}
          productId={pendingEngagementProductId ?? productId}
          vars={{
            contato_nome: contactName ?? undefined,
            cliente_nome: clientName,
            produto_nome: productName ?? undefined,
            usuario_nome: api4com?.userName
          }}
        />
      ) : null}
      {hasEmail ? (
        <EmailApproachModal
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          email={email!.trim()}
          productId={pendingEngagementProductId ?? productId}
          vars={{
            contato_nome: contactName ?? undefined,
            cliente_nome: clientName,
            produto_nome: productName ?? undefined,
            usuario_nome: api4com?.userName
          }}
        />
      ) : null}
      <CadastroModal open={noExtensionOpen} title="Ramal não configurado" onClose={closeNoExtension}>
        <p style={{ whiteSpace: "pre-line", margin: 0 }}>{API4COM_NO_EXTENSION_MESSAGE}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/perfil" className="btn btn-primary" onClick={closeNoExtension}>
            Ir para Meu perfil
          </Link>
          <button type="button" className="btn" onClick={closeNoExtension}>
            Fechar
          </button>
        </div>
      </CadastroModal>
      <CadastroModal
        open={identityPickerOpen}
        title="Ligar como"
        onClose={closeIdentityPicker}
        panelClassName="dial-picker-panel"
      >
        <div className="dial-picker-modal">
          {dialError ? <div className="alert alert-error">{dialError}</div> : null}
          <p className="muted" style={{ marginTop: 0 }}>
            Você não tem ramal cadastrado. Escolha um usuário com ramal para testar ligações via API4COM.
          </p>
          {identityLoading ? <p className="muted">Carregando…</p> : null}
          {!identityLoading && dialIdentities.length === 0 && !dialError ? (
            <div className="alert alert-error">
              Nenhum usuário ativo com ramal cadastrado. Cadastre ramais em Admin → Usuários ou peça à BDR configurar
              em Meu perfil.
            </div>
          ) : null}
          <ul className="dial-picker-list">
            {dialIdentities.map((u) => (
              <li key={u.id}>
                <button type="button" className="dial-picker-option" disabled={dialing} onClick={() => onIdentityPicked(u)}>
                  <span className="dial-picker-option-body">
                    <span className="dial-picker-number">{u.name}</span>
                    <span className="dial-picker-meta">
                      Ramal {u.api4com_extension.trim()} · {u.email}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </CadastroModal>
      <CadastroModal open={dialFeedbackOpen} title="Não foi possível ligar" onClose={closeDialFeedback}>
        {dialError ? (
          <div className="alert alert-error" style={{ whiteSpace: "pre-line" }}>
            {dialError}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
          <button type="button" className="btn btn-primary" onClick={closeDialFeedback}>
            Fechar
          </button>
        </div>
      </CadastroModal>
      <CadastroModal open={pickerOpen} title="Escolher número" onClose={closePicker} panelClassName="dial-picker-panel">
        <div className="dial-picker-modal">
          {dialError ? <div className="alert alert-error">{dialError}</div> : null}
          <div className="dial-picker-head">
            <div className="dial-picker-head-icon" aria-hidden>
              <Phone size={22} />
            </div>
            <p className="dial-picker-head-text">
              <strong>Qual número ligar?</strong>
              <br />
              Escolha abaixo o número para fazer a ligação.
            </p>
          </div>
          {pickerLoading ? <p className="muted">Carregando telefones…</p> : null}
          {!pickerLoading && pickerOptions.length === 0 && !dialError ? (
            <p className="muted">Nenhum telefone disponível.</p>
          ) : null}
          <ul className="dial-picker-list">
            {pickerOptions.map((o, i) => {
              const status = o.verification_status ?? "unverified";
              const isBad = status === "invalid_number" || status === "wrong_contact";
              const maxAttempts = o.maxDialAttempts ?? 3;
              const callCount = o.dialHistoryAt?.length ?? o.cycleNoContactCount ?? 0;
              const statusLine = dialPickerStatusLine(callCount, maxAttempts);
              const historyKey = dialHistoryKey(o, i);
              const historyExpanded = expandedDialHistory.has(historyKey);
              const sortedTimes = sortDialHistoryNewestFirst(o.dialHistoryAt ?? []);
              const visibleTimes = historyExpanded
                ? sortedTimes
                : sortedTimes.slice(0, DIAL_PICKER_RECENT_CALLS);
              const hasMoreHistory = !historyExpanded && sortedTimes.length > DIAL_PICKER_RECENT_CALLS;
              const atLimit = dialOptionAtCallLimit(o);
              const disabled = dialing || pickerLoading;
              const phoneKind = dialPhoneKindLabel(o.phone);
              return (
                <li key={`${o.clientPhoneId ?? o.contactId ?? "x"}-${o.phone}-${i}`}>
                  <div
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    className={`dial-picker-option${isBad ? " dial-picker-option--bad" : ""}${disabled ? " dial-picker-option--disabled" : ""}`}
                    aria-disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      void startCall(o, true, resolvedDialAsUserId(), pendingEngagementProductId);
                    }}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void startCall(o, true, resolvedDialAsUserId(), pendingEngagementProductId);
                      }
                    }}
                  >
                    <span className="dial-picker-option-body">
                      <span className="dial-picker-number-row">
                        <span className="dial-picker-number">{formatPhoneDisplay(o.phone)}</span>
                        <span
                          className={`dial-picker-kind dial-picker-kind--${phoneKind.kind}`}
                          title={phoneKind.label}
                          aria-label={phoneKind.label}
                        >
                          {phoneKind.kind === "mobile" ? (
                            <Smartphone size={17} strokeWidth={2} aria-hidden />
                          ) : (
                            <Phone size={17} strokeWidth={2} aria-hidden />
                          )}
                        </span>
                      </span>
                      <span className="dial-picker-meta dial-picker-meta--status">{statusLine}</span>
                      {visibleTimes.length > 0 ? (
                        <span className="dial-picker-call-history">
                          {visibleTimes.map((at, idx) => {
                            const isLast = idx === visibleTimes.length - 1;
                            return (
                              <span key={`${at}-${idx}`} className="dial-picker-meta dial-picker-meta--dates">
                                {formatDialPickerCallTime(at)}
                                {hasMoreHistory && isLast ? (
                                  <>
                                    {" "}
                                    <button
                                      type="button"
                                      className="dial-picker-more"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDialHistoryExpanded(historyKey);
                                      }}
                                    >
                                      mais
                                    </button>
                                  </>
                                ) : null}
                              </span>
                            );
                          })}
                        </span>
                      ) : null}
                    </span>
                    {atLimit ? (
                      <span className="dial-picker-option-check" aria-label="Limite de ligações atingido">
                        <Check size={20} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </CadastroModal>
    </>
  );
}
