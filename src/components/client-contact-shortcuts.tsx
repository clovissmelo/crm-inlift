"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Phone, Mail, MessageCircle } from "lucide-react";
import { API4COM_NO_EXTENSION_MESSAGE, type Api4comDialIdentity } from "@/lib/api4com/dial-identity-shared";
import { VerificationStatusIcon } from "@/components/contact-verification-ui";
import type { ContactVerification } from "@/lib/types";
import { WhatsAppTemplateModal } from "@/components/whatsapp-template-modal";
import { CadastroModal } from "@/components/cadastro-ui";
import { useApi4comSession } from "@/components/api4com-call-provider";
import { apiErrorText } from "@/lib/api-error-text";
import { EmailApproachModal } from "@/components/email-approach-modal";
import type { PhoneDialContextItem } from "@/lib/call-strategy/eligible-phones";
import { formatPhoneDialSituation } from "@/lib/call-strategy/phone-dial-status";
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
      attemptsAtLimit: p.attempts_at_limit
    }));
}

function dialOptionCounterSummary(o: ContactDialOption): string | null {
  const lines = o.counterLines?.filter((line) => !/aguardando registro/i.test(line));
  if (lines?.length) return lines.join(" · ");
  if (o.counterLine) return o.counterLine;
  if (o.position != null && o.total != null) {
    const tries =
      o.cycleNoContactCount != null && o.cycleNoContactCount > 0
        ? ` · ${o.cycleNoContactCount} tentativa(s) sem contato neste ciclo`
        : "";
    return `Número ${o.position} de ${o.total}${tries}`;
  }
  return null;
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
  size = "sm"
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
}) {
  const api4com = useApi4comSession();
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

  const waNumber = whatsapp || phone;
  const hasEmail = Boolean(email?.trim());
  const btnClass = size === "sm" ? "btn btn-icon-sm" : "btn";

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

  async function startCall(option: ContactDialOption, fromPicker: boolean, asUserId?: number | null) {
    if (!clientId || !api4com) return;
    const dialAs = asUserId ?? resolvedDialAsUserId();
    if (!dialAs) return;
    setDialing(true);
    setDialError(null);
    const payload: Record<string, unknown> = {
      client_id: clientId,
      contact_id: option.contactId ?? contactId ?? null,
      product_id: productId ?? null,
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

  async function proceedToPhonePicker(asUserId: number) {
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

  async function openAdminIdentityPicker() {
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

  function onCallClick() {
    if (!useApi4com || !api4com) return;
    setDialError(null);
    setDialFeedbackOpen(false);
    if (api4com.hasOwnExtension) {
      void proceedToPhonePicker(api4com.userId);
      return;
    }
    if (api4com.isAdmin) {
      void openAdminIdentityPicker();
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
      <div className="contact-shortcuts" onClick={(e) => e.stopPropagation()}>
        {useApi4com ? (
          <button
            type="button"
            className={btnClass}
            title="Ligar via API4COM"
            aria-label="Ligar via API4COM"
            disabled={dialing}
            onClick={onCallClick}
          >
            <Phone size={16} />
          </button>
        ) : tel ? (
          <a className={btnClass} href={tel} title="Ligar" aria-label="Ligar">
            <Phone size={16} />
          </a>
        ) : (
          <span className={`${btnClass} disabled`} title="Sem telefone" aria-hidden>
            <Phone size={16} />
          </span>
        )}
        {waNumber ? (
          <button
            type="button"
            className={btnClass}
            title="WhatsApp"
            aria-label="WhatsApp"
            onClick={() => setWaOpen(true)}
          >
            <MessageCircle size={16} />
          </button>
        ) : (
          <span className={`${btnClass} disabled`} title="Sem WhatsApp" aria-hidden>
            <MessageCircle size={16} />
          </span>
        )}
        {hasEmail ? (
          <button type="button" className={btnClass} title="E-mail" aria-label="E-mail" onClick={() => setEmailOpen(true)}>
            <Mail size={16} />
          </button>
        ) : (
          <span className={`${btnClass} disabled`} title="Sem e-mail" aria-hidden>
            <Mail size={16} />
          </span>
        )}
      </div>
      {waNumber ? (
        <WhatsAppTemplateModal
          open={waOpen}
          onClose={() => setWaOpen(false)}
          phone={waNumber}
          productId={productId}
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
          productId={productId}
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
              Escolha abaixo. Os telefones precisam ter a quantidade mínima de tentativas por telefone.
            </p>
          </div>
          {pickerLoading ? <p className="muted">Carregando telefones e contadores…</p> : null}
          {!pickerLoading && pickerOptions.length === 0 && !dialError ? (
            <p className="muted">Nenhum telefone disponível.</p>
          ) : null}
          <ul className="dial-picker-list">
            {pickerOptions.map((o, i) => {
              const status = o.verification_status ?? "unverified";
              const isBad = status === "invalid_number" || status === "wrong_contact";
              const counterSummary = dialOptionCounterSummary(o);
              const situation =
                o.status != null
                  ? formatPhoneDialSituation({
                      status: o.status,
                      needs_review: o.needsReview,
                      next_eligible_at: o.nextEligibleAt
                    })
                  : null;
              return (
                <li key={`${o.clientPhoneId ?? o.contactId ?? "x"}-${o.phone}-${i}`}>
                  <button
                    type="button"
                    className={`dial-picker-option${isBad ? " dial-picker-option--bad" : ""}`}
                    disabled={dialing || pickerLoading}
                    onClick={() => void startCall(o, true, resolvedDialAsUserId())}
                  >
                    <VerificationStatusIcon status={status} size={22} />
                    <span className="dial-picker-option-body">
                      <span className="dial-picker-number">{formatPhoneDisplay(o.phone)}</span>
                      <span className="dial-picker-meta">
                        {[o.contactName, o.attemptLabel ?? o.label, o.origin].filter(Boolean).join(" · ") ||
                          "Contato"}
                        {situation ? ` · ${situation}` : ""}
                      </span>
                      {counterSummary ? (
                        <span className="dial-picker-meta dial-picker-meta--counters">{counterSummary}</span>
                      ) : null}
                    </span>
                    {o.attemptsAtLimit ? (
                      <span className="dial-picker-option-check" aria-label="Limite de tentativas atingido">
                        <Check size={20} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </CadastroModal>
    </>
  );
}
