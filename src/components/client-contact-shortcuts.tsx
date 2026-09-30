"use client";

import { useMemo, useState } from "react";
import { Phone, Mail, MessageCircle } from "lucide-react";
import { VerificationStatusIcon } from "@/components/contact-verification-ui";
import type { ContactVerification } from "@/lib/types";
import { WhatsAppTemplateModal } from "@/components/whatsapp-template-modal";
import { CadastroModal } from "@/components/cadastro-ui";
import { useApi4comSession } from "@/components/api4com-call-provider";
import { apiErrorText } from "@/lib/api-error-text";
import { EmailApproachModal } from "@/components/email-approach-modal";
import { telLink, formatPhoneDisplay, isMobileBr, phoneDigits } from "@/lib/format";

export type ContactDialOption = {
  contactId?: number;
  contactName?: string | null;
  phone: string;
  label?: string;
  verification_status?: ContactVerification;
};

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
  const [dialFeedbackOpen, setDialFeedbackOpen] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [dialError, setDialError] = useState<string | null>(null);

  const waNumber = whatsapp || phone;
  const hasEmail = Boolean(email?.trim());
  const btnClass = size === "sm" ? "btn btn-icon-sm" : "btn";

  const options = useMemo(
    () => sortContactDialOptions(buildDialOptions({ phone, whatsapp, contactId, contactName, dialOptions })),
    [phone, whatsapp, contactId, contactName, dialOptions]
  );
  const useApi4com = Boolean(api4com?.canDial && clientId && options.length);

  async function startCall(option: ContactDialOption, fromPicker: boolean) {
    if (!clientId) return;
    setDialing(true);
    setDialError(null);
    const res = await fetch("/api/api4com/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        contact_id: option.contactId ?? contactId ?? null,
        product_id: productId ?? null,
        phone: option.phone
      })
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
  }

  function closeDialFeedback() {
    setDialFeedbackOpen(false);
    setDialError(null);
  }

  function onCallClick() {
    if (!useApi4com) return;
    setDialError(null);
    setDialFeedbackOpen(false);
    if (options.length === 1) {
      void startCall(options[0]!, false);
      return;
    }
    setPickerOpen(true);
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
            disabled={dialing || options.length === 0}
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
            produto_nome: productName ?? undefined
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
            produto_nome: productName ?? undefined
          }}
        />
      ) : null}
      <CadastroModal open={dialFeedbackOpen} title="Não foi possível ligar" onClose={closeDialFeedback}>
        {dialError ? <div className="alert alert-error">{dialError}</div> : null}
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
              <strong>Discador</strong>
              <br />
              Escolha o número para ligar via API4COM. Verificados aparecem primeiro.
            </p>
          </div>
          <ul className="dial-picker-list">
            {options.map((o, i) => {
              const status = o.verification_status ?? "unverified";
              const isBad = status === "invalid_number" || status === "wrong_contact";
              return (
                <li key={`${o.contactId ?? "x"}-${o.phone}-${i}`}>
                  <button
                    type="button"
                    className={`dial-picker-option${isBad ? " dial-picker-option--bad" : ""}`}
                    disabled={dialing}
                    onClick={() => void startCall(o, true)}
                  >
                    <VerificationStatusIcon status={status} size={22} />
                    <span className="dial-picker-option-body">
                      <span className="dial-picker-number">{formatPhoneDisplay(o.phone)}</span>
                      <span className="dial-picker-meta">
                        {[o.contactName, o.label].filter(Boolean).join(" · ") || "Contato"}
                      </span>
                    </span>
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
