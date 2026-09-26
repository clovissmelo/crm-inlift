"use client";

import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { applyTemplate, findMissingTemplateVars, PLACEHOLDER_HELP } from "@/lib/message-templates";
import { whatsAppLink } from "@/lib/format";

export function WhatsAppTemplateModal({
  open,
  onClose,
  phone,
  vars,
  productId
}: {
  open: boolean;
  onClose: () => void;
  phone: string;
  vars: { contato_nome?: string; cliente_nome?: string; produto_nome?: string };
  productId?: number;
}) {
  const [scripts, setScripts] = useState<Array<{ id: number; title: string; body: string }>>([]);
  const [scriptId, setScriptId] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams({ type: "whatsapp" });
    if (productId) params.set("product_id", String(productId));
    void fetch(`/api/message-scripts?${params}`).then(async (r) => {
      const data = (await r.json()) as { items: Array<{ id: number; title: string; body: string }> };
      setScripts(data.items ?? []);
    });
  }, [open, productId]);

  useEffect(() => {
    if (open) return;
    setScriptId("");
    setBody("");
    setError(null);
  }, [open]);

  function loadScript(id: string) {
    setScriptId(id);
    const s = scripts.find((x) => String(x.id) === id);
    setBody(s?.body ?? "");
    setError(null);
  }

  function openChat() {
    const missing = findMissingTemplateVars(body, vars);
    if (missing.length) {
      setError(`Preencha ou corrija na mensagem: ${missing.join(", ")}`);
      return;
    }
    const text = encodeURIComponent(applyTemplate(body, vars));
    const base = whatsAppLink(phone);
    if (!base) return;
    window.open(`${base}?text=${text}`, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <CadastroModal open={open} title="Mensagem WhatsApp" onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Escolha um modelo, revise e abra a conversa. Isso não registra abordagem automaticamente.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="field">
        <label className="label">Modelo</label>
        <select className="select" value={scriptId} onChange={(e) => loadScript(e.target.value)}>
          <option value="">Digitar manualmente</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">Mensagem</label>
        <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
      </div>
      <p className="muted" style={{ fontSize: "0.75rem" }}>
        Campos: {PLACEHOLDER_HELP.map((p) => p.key).join(", ")}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
        <button className="btn" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" type="button" onClick={openChat} disabled={!body.trim()}>
          Abrir WhatsApp
        </button>
      </div>
    </CadastroModal>
  );
}
