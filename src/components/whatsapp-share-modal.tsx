"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";

type Props = {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
};

export function WhatsAppShareModal({ open, title, text, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [open, text]);

  async function copy() {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }

  return (
    <CadastroModal open={open} title={title} onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Copie o texto abaixo e cole no WhatsApp para enviar.
      </p>
      <div className="field copy-field">
        <label className="label" htmlFor="whatsapp-share-text">
          Mensagem
        </label>
        <div className="copy-field-row">
          <textarea
            id="whatsapp-share-text"
            ref={textareaRef}
            readOnly
            className="textarea copy-field-input whatsapp-share-textarea"
            rows={18}
            value={text}
          />
          <button
            type="button"
            className="btn btn-icon-sm copy-field-btn whatsapp-share-copy-btn"
            onClick={() => void copy()}
            aria-label={copied ? "Copiado" : "Copiar mensagem"}
            title={copied ? "Copiado" : "Copiar"}
          >
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          </button>
        </div>
      </div>
    </CadastroModal>
  );
}
