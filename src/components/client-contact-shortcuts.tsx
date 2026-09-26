"use client";

import { useState } from "react";
import { Phone, Mail, MessageCircle } from "lucide-react";
import { WhatsAppTemplateModal } from "@/components/whatsapp-template-modal";
import { CadastroModal } from "@/components/cadastro-ui";
import { useApi4comSession } from "@/components/api4com-call-provider";
import { mailtoLink, telLink, formatPhoneDisplay } from "@/lib/format";

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
      label: "WhatsApp"
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
  clientId?: number;
  contactId?: number;
  dialOptions?: ContactDialOption[];
  size?: "sm" | "md";
}) {
  const api4com = useApi4comSession();
  const [waOpen, setWaOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [dialError, setDialError] = useState<string | null>(null);

  const waNumber = whatsapp || phone;
  const mail = email ? mailtoLink(email) : null;
  const btnClass = size === "sm" ? "btn btn-icon-sm" : "btn";

  const options = buildDialOptions({ phone, whatsapp, contactId, contactName, dialOptions });
  const useApi4com = Boolean(api4com?.canDial && clientId && options.length);

  async function startCall(option: ContactDialOption) {
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
    const data = (await res.json()) as { error?: string };
    setDialing(false);
    if (!res.ok) {
      setDialError(data.error ?? "Não foi possível iniciar a ligação.");
      return;
    }
    setPickerOpen(false);
  }

  function onCallClick() {
    if (!useApi4com) return;
    setDialError(null);
    if (options.length === 1) {
      void startCall(options[0]!);
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
        {mail ? (
          <a className={btnClass} href={mail} title="E-mail" aria-label="E-mail">
            <Mail size={16} />
          </a>
        ) : (
          <span className={`${btnClass} disabled`} title="Sem e-mail" aria-hidden>
            <Mail size={16} />
          </span>
        )}
      </div>
      {dialError ? (
        <div className="alert alert-error" style={{ marginTop: 4, fontSize: "0.75rem", maxWidth: 280 }}>
          {dialError}
        </div>
      ) : null}
      {waNumber ? (
        <WhatsAppTemplateModal
          open={waOpen}
          onClose={() => setWaOpen(false)}
          phone={waNumber}
          productId={productId}
          vars={{
            contato_nome: contactName ?? undefined,
            cliente_nome: clientName
          }}
        />
      ) : null}
      <CadastroModal open={pickerOpen} title="Escolher número" onClose={() => setPickerOpen(false)}>
        {dialError ? <div className="alert alert-error">{dialError}</div> : null}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {options.map((o, i) => (
            <li key={`${o.phone}-${i}`} style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", justifyContent: "flex-start" }}
                disabled={dialing}
                onClick={() => void startCall(o)}
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
