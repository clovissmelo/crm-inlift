"use client";

import { Check, Copy, Mail, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { TemplatePlaceholderHelp } from "@/components/template-placeholder-help";
import { applyTemplate, findMissingTemplateVars, type TemplateVars } from "@/lib/message-templates";
import { buildMailtoHref } from "@/lib/format";

type Script = { id: number; title: string; body: string };

function CopyField({
  label,
  value,
  onChange,
  multiline,
  showPlaceholderHelp
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  showPlaceholderHelp?: boolean;
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
      {showPlaceholderHelp ? (
        <div className="label-with-help">
          <label className="label">{label}</label>
          <TemplatePlaceholderHelp />
        </div>
      ) : (
        <label className="label">{label}</label>
      )}
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
  const [mailtoError, setMailtoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setPickedId("");
    setSubject("");
    setBody("");
    setToEmail(email);
    setError(null);
    setMailtoError(null);
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
    const manualSelected = pickedId === "manual" || (scripts.length === 0 && pickedId === "");
    return (
      <CadastroModal
        open
        title="Selecionar abordagem"
        onClose={closeAll}
        panelClassName="email-approach-pick-panel"
      >
        <div className="email-approach-pick-modal">
          <div className="dial-picker-head email-approach-pick-head">
            <div className="dial-picker-head-icon" aria-hidden>
              <Mail size={22} />
            </div>
            <p className="dial-picker-head-text">
              <strong>Qual modelo usar?</strong>
              <br />
              Escolha abaixo. Isso não registra abordagem automaticamente.
            </p>
          </div>
          {error ? <div className="alert alert-error">{error}</div> : null}
          {loadingScripts ? <p className="muted">Carregando modelos…</p> : null}
          {!loadingScripts ? (
            <fieldset className="email-approach-pick-list">
              <legend className="sr-only">Modelos de e-mail</legend>
              {scripts.map((s) => {
                const id = String(s.id);
                const selected = pickedId === id;
                return (
                  <label
                    key={s.id}
                    className={`email-approach-pick-item${selected ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name="email-script"
                      value={id}
                      checked={selected}
                      onChange={() => setPickedId(id)}
                    />
                    <span className="email-approach-pick-item__body">
                      <span className="email-approach-pick-item__title">{s.title}</span>
                      <span className="email-approach-pick-item__hint muted">Modelo de e-mail</span>
                    </span>
                    {selected ? (
                      <span className="email-approach-pick-item__check" aria-hidden>
                        <Check size={20} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </label>
                );
              })}
              <label className={`email-approach-pick-item${manualSelected ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  className="sr-only"
                  name="email-script"
                  value="manual"
                  checked={manualSelected}
                  onChange={() => setPickedId("manual")}
                />
                <span className="email-approach-pick-item__icon muted" aria-hidden>
                  <PenLine size={18} />
                </span>
                <span className="email-approach-pick-item__body">
                  <span className="email-approach-pick-item__title">Digitar manualmente</span>
                  <span className="email-approach-pick-item__hint muted">Assunto e texto em branco</span>
                </span>
                {manualSelected ? (
                  <span className="email-approach-pick-item__check" aria-hidden>
                    <Check size={20} strokeWidth={2.5} />
                  </span>
                ) : null}
              </label>
            </fieldset>
          ) : null}
          <div className="email-approach-pick-actions">
            <button type="button" className="btn" onClick={closeAll}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={loadingScripts || (scripts.length > 0 && !pickedId)}
              onClick={() => goCompose(pickedId === "manual" || scripts.length === 0)}
            >
              Continuar
            </button>
          </div>
        </div>
      </CadastroModal>
    );
  }

  function openMailtoClient() {
    setMailtoError(null);
    const href = buildMailtoHref({ email: toEmail, subject, body });
    if (!href) {
      setMailtoError("Informe o e-mail de destino.");
      return;
    }
    window.location.href = href;
  }

  return (
    <CadastroModal open title="E-mail" onClose={closeAll} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Copie os campos ou use Mailto para abrir seu cliente de e-mail com destino, assunto e texto.
      </p>
      {mailtoError ? <div className="alert alert-error">{mailtoError}</div> : null}
      <CopyField label="E-mail" value={toEmail} onChange={setToEmail} />
      <CopyField label="Título" value={subject} onChange={setSubject} showPlaceholderHelp />
      <CopyField label="Texto" value={body} onChange={setBody} multiline showPlaceholderHelp />
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => setStep("pick")}>
          Voltar
        </button>
        <button type="button" className="btn btn-primary" onClick={closeAll}>
          Fechar
        </button>
        <button type="button" className="btn btn-primary" onClick={openMailtoClient} disabled={!toEmail.trim()}>
          Mailto
        </button>
      </div>
    </CadastroModal>
  );
}
