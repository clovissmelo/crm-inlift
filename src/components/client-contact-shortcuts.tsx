"use client";

import { useState } from "react";
import { Phone, Mail, MessageCircle } from "lucide-react";
import { WhatsAppTemplateModal } from "@/components/whatsapp-template-modal";
import { CadastroModal } from "@/components/cadastro-ui";
import { useApi4comSession } from "@/components/api4com-call-provider";
import { apiErrorText } from "@/lib/api-error-text";
import { EmailApproachModal } from "@/components/email-approach-modal";
import { telLink, formatPhoneDisplay } from "@/lib/format";

export type ContactDialOption = {
  contactId?: number;
  contactName?: string | null;
  phone: string;
  label?: string;
};

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

  const options = buildDialOptions({ phone, whatsapp, contactId, contactName, dialOptions });
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
      <CadastroModal open={pickerOpen} title="Escolher número" onClose={closePicker}>
        {dialError ? <div className="alert alert-error">{dialError}</div> : null}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {options.map((o, i) => (
            <li key={`${o.phone}-${i}`} style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", justifyContent: "flex-start" }}
                disabled={dialing}
                onClick={() => void startCall(o, true)}
              >
                {formatPhoneDisplay(o.phone)}
                {o.contactName ? ` · ${o.contactName}` : ""}
                {o.label ? ` (${o.label})` : ""}
              </button>
            </li>
          ))}
        </ul>
      </CadastroModal>
    </>
  );
}
