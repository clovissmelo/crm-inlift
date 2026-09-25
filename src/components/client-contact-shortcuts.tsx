"use client";

import { useState } from "react";
import { Phone, Mail, MessageCircle } from "lucide-react";
import { WhatsAppTemplateModal } from "@/components/whatsapp-template-modal";
import { mailtoLink, telLink } from "@/lib/format";

export function ClientContactShortcuts({
  clientName,
  contactName,
  phone,
  whatsapp,
  email,
  productId,
  size = "sm"
}: {
  clientName: string;
  contactName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  productId?: number;
  size?: "sm" | "md";
}) {
  const [waOpen, setWaOpen] = useState(false);
  const waNumber = whatsapp || phone;
  const tel = phone ? telLink(phone) : whatsapp ? telLink(whatsapp) : null;
  const mail = email ? mailtoLink(email) : null;

  const btnClass = size === "sm" ? "btn btn-icon-sm" : "btn";

  return (
    <>
      <div className="contact-shortcuts" onClick={(e) => e.stopPropagation()}>
        {tel ? (
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
    </>
  );
}
