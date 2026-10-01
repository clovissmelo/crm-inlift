"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, HelpCircle } from "lucide-react";
import { CadastroModal } from "@/components/cadastro-ui";

function Api4comHelpTooltip() {
  return (
    <span className="api4com-help-wrap">
      <button type="button" className="btn btn-icon-sm api4com-help-btn" aria-label="Instruções API4COM">
        <HelpCircle size={16} />
      </button>
      <span className="api4com-help-tooltip" role="tooltip">
        <strong>Token:</strong> em{" "}
        <a href="https://app.api4com.com/user/tokens" target="_blank" rel="noreferrer">
          app.api4com.com → Tokens de acesso
        </a>
        , copie a string completa (ou crie um novo se expirou). Guardado só no servidor.
        <br />
        <br />
        <strong>Ramal:</strong> no painel API4COM, menu <em>Usuários</em>, veja o ramal do usuário. Sem senha SIP aqui. Sem
        token pessoal só no modo &quot;cada BDR no perfil&quot; (Admin → API4COM).
      </span>
    </span>
  );
}

function TokenInput({
  value,
  onChange,
  hasApiToken,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  hasApiToken?: boolean;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-with-icon">
      <input
        className="input"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? (hasApiToken ? "•••••••• (preencha para substituir)" : "Cole o token completo")}
        autoComplete="off"
      />
      <button
        type="button"
        className="input-icon-btn"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar token" : "Mostrar token"}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

/** Ramal e token API4COM para perfil BDR. */
export function Api4comBdrFields({
  extension,
  onExtensionChange,
  apiToken,
  onApiTokenChange,
  hasApiToken,
  onClearToken,
  clearingToken,
  allowPersonalToken = true
}: {
  extension: string;
  onExtensionChange: (value: string) => void;
  apiToken: string;
  onApiTokenChange: (value: string) => void;
  hasApiToken?: boolean;
  onClearToken?: () => void;
  clearingToken?: boolean;
  /** false quando o admin usa token global único */
  allowPersonalToken?: boolean;
}) {
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);

  const extensionTrimmed = extension.trim();
  const hasExtension = extensionTrimmed.length > 0;
  const tokenConfigured = Boolean(hasApiToken);

  return (
    <div className="api4com-bdr-fields">
      <div className="api4com-bdr-toolbar">
        <span className="label" style={{ margin: 0 }}>
          Integração API4COM
        </span>
        <Api4comHelpTooltip />
      </div>

      <div
        className={
          allowPersonalToken ? "api4com-bdr-actions api4com-bdr-actions--split" : "api4com-bdr-actions"
        }
      >
        <button
          type="button"
          className={
            hasExtension
              ? "btn api4com-bdr-action-btn api4com-bdr-btn--token-ok"
              : "btn api4com-bdr-action-btn"
          }
          onClick={() => setExtensionModalOpen(true)}
        >
          {hasExtension ? `Ramal ${extensionTrimmed}` : "Configurar ramal"}
        </button>
        {allowPersonalToken ? (
          <button
            type="button"
            className={
              tokenConfigured
                ? "btn api4com-bdr-action-btn api4com-bdr-btn--token-ok"
                : "btn api4com-bdr-action-btn"
            }
            onClick={() => setTokenModalOpen(true)}
          >
            {tokenConfigured ? (
              <>
                Token cadastrado
                <Check size={16} aria-hidden className="api4com-bdr-btn-check" />
              </>
            ) : (
              "Configurar token"
            )}
          </button>
        ) : null}
      </div>

      <CadastroModal
        open={extensionModalOpen}
        title={hasExtension ? "Alterar ramal" : "Configurar ramal"}
        onClose={() => setExtensionModalOpen(false)}
      >
        <div className="field">
          <label className="label">Ramal API4COM</label>
          <input
            className="input"
            value={extension}
            onChange={(e) => onExtensionChange(e.target.value)}
            placeholder="Ex.: 1001"
            autoComplete="off"
          />
          <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
            Use o ramal do seu usuário no painel API4COM (menu Usuários). Salve o perfil para aplicar.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
          <button type="button" className="btn btn-primary" onClick={() => setExtensionModalOpen(false)}>
            Concluir
          </button>
        </div>
      </CadastroModal>

      {allowPersonalToken ? (
        <CadastroModal
          open={tokenModalOpen}
          title={tokenConfigured ? "Alterar token" : "Configurar token"}
          onClose={() => setTokenModalOpen(false)}
        >
          <div className="field">
            <label className="label">Token de acesso API4COM</label>
            <TokenInput value={apiToken} onChange={onApiTokenChange} hasApiToken={hasApiToken} />
            {hasApiToken && onClearToken ? (
              <button
                type="button"
                className="btn"
                style={{ marginTop: 8 }}
                onClick={onClearToken}
                disabled={clearingToken}
              >
                {clearingToken ? "Removendo…" : "Remover token salvo"}
              </button>
            ) : null}
            <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
              Cole o token completo e salve o perfil. O valor fica apenas no servidor.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-primary" onClick={() => setTokenModalOpen(false)}>
              Concluir
            </button>
          </div>
        </CadastroModal>
      ) : null}
    </div>
  );
}
