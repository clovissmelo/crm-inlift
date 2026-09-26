"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { applyTemplate, findMissingTemplateVars, PLACEHOLDER_HELP, type TemplateVars } from "@/lib/message-templates";

type Script = { id: number; title: string; body: string };

function CopyField({
  label,
  value,
  onChange,
  multiline
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="field copy-field">
      <label className="label">{label}</label>
      <div className="copy-field-row">
        {multiline ? (
          <textarea className="textarea copy-field-input" value={value} onChange={(e) => onChange?.(e.target.value)} rows={8} />
        ) : (
          <input className="input copy-field-input" value={value} onChange={(e) => onChange?.(e.target.value)} />
        )}
        <button type="button" className="btn btn-icon-sm copy-field-btn" onClick={() => void copy()} aria-label={`Copiar ${label.toLowerCase()}`} title={copied ? "Copiado" : "Copiar"}>
          <Copy size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function EmailApproachModal({
  open,
  onClose,
  email,
  vars,
  productId
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  vars: TemplateVars;
  productId?: number;
}) {
  const [step, setStep] = useState<"pick" | "compose">("pick");
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [pickedId, setPickedId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toEmail, setToEmail] = useState(email);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setPickedId("");
    setSubject("");
    setBody("");
    setToEmail(email);
    setError(null);
    setLoadingScripts(true);
    const params = new URLSearchParams({ type: "email" });
    if (productId) params.set("product_id", String(productId));
    void fetch(`/api/message-scripts?${params}`)
      .then(async (r) => {
        const data = (await r.json()) as { items: Script[] };
        setScripts(data.items ?? []);
      })
      .finally(() => setLoadingScripts(false));
  }, [open, email, productId]);

  function closeAll() {
    onClose();
  }

  function goCompose(manual: boolean) {
    setError(null);
    if (manual || pickedId === "" || pickedId === "manual") {
      setSubject("");
      setBody("");
      setStep("compose");
      return;
    }
    const script = scripts.find((s) => String(s.id) === pickedId);
    if (!script) {
      setError("Selecione uma abordagem.");
      return;
    }
    const subj = applyTemplate(script.title, vars);
    const text = applyTemplate(script.body, vars);
    const missing = findMissingTemplateVars(`${script.title}\n${script.body}`, vars);
    if (missing.length) {
      setError(`Complete os dados do lead para usar este modelo: ${missing.join(", ")}`);
      return;
    }
    setSubject(subj);
    setBody(text);
    setStep("compose");
  }

  if (!open) return null;

  if (step === "pick") {
    return (
      <CadastroModal open title="Selecionar abordagem" onClose={closeAll}>
        <p className="muted" style={{ marginTop: 0 }}>
          Escolha o modelo de e-mail. Isso não registra abordagem automaticamente.
        </p>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {loadingScripts ? <p className="muted">Carregando modelos…</p> : null}
        {!loadingScripts ? (
          <div className="field" style={{ marginBottom: 0 }}>
            <fieldset className="email-approach-pick-list">
              <legend className="sr-only">Modelos de e-mail</legend>
              {scripts.map((s) => (
                <label key={s.id} className="email-approach-pick-item">
                  <input type="radio" name="email-script" value={String(s.id)} checked={pickedId === String(s.id)} onChange={() => setPickedId(String(s.id))} />
                  <span>{s.title}</span>
                </label>
              ))}
              <label className="email-approach-pick-item">
                <input
                  type="radio"
                  name="email-script"
                  value="manual"
                  checked={pickedId === "manual" || (scripts.length === 0 && pickedId === "")}
                  onChange={() => setPickedId("manual")}
                />
                <span>Digitar manualmente</span>
              </label>
            </fieldset>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button type="button" className="btn" onClick={closeAll}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loadingScripts || (scripts.length > 0 && !pickedId)}
            onClick={() => goCompose(pickedId === "manual" || scripts.length === 0)}
          >
            OK
          </button>
        </div>
      </CadastroModal>
    );
  }

  return (
    <CadastroModal open title="E-mail" onClose={closeAll} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Copie os campos para enviar no seu cliente de e-mail.
      </p>
      <CopyField label="E-mail" value={toEmail} onChange={setToEmail} />
      <CopyField label="Título" value={subject} onChange={setSubject} />
      <CopyField label="Texto" value={body} onChange={setBody} multiline />
      <p className="muted" style={{ fontSize: "0.75rem" }}>
        Campos do modelo: {PLACEHOLDER_HELP.map((p) => p.key).join(", ")}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
        <button type="button" className="btn" onClick={() => setStep("pick")}>
          Voltar
        </button>
        <button type="button" className="btn btn-primary" onClick={closeAll}>
          Fechar
        </button>
      </div>
    </CadastroModal>
  );
}
