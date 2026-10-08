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
        <strong>Ramal:</strong> no painel API4COM, menu <em>Usuários</em>, veja o ramal do usuário.
        <br />
        <br />
        <strong>Senha SIP:</strong> a mesma exibida ao instalar o Webphone no portal (Usuários → instalar). Necessária
        para o discador embutido no CRM. Sem token pessoal só no modo &quot;cada BDR no perfil&quot; (Admin → API4COM).
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
  sipPassword,
  onSipPasswordChange,
  hasSipPassword,
  onClearSipPassword,
  allowPersonalToken = true
}: {
  extension: string;
  onExtensionChange: (value: string) => void;
  apiToken: string;
  onApiTokenChange: (value: string) => void;
  hasApiToken?: boolean;
  onClearToken?: () => void;
  clearingToken?: boolean;
  sipPassword?: string;
  onSipPasswordChange?: (value: string) => void;
  hasSipPassword?: boolean;
  onClearSipPassword?: () => void;
  /** false quando o admin usa token global único */
  allowPersonalToken?: boolean;
}) {
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [sipModalOpen, setSipModalOpen] = useState(false);

  const extensionTrimmed = extension.trim();
  const hasExtension = extensionTrimmed.length > 0;
  const tokenConfigured = Boolean(hasApiToken);
  const sipConfigured = Boolean(hasSipPassword);

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
        {onSipPasswordChange ? (
          <button
            type="button"
            className={
              sipConfigured
                ? "btn api4com-bdr-action-btn api4com-bdr-btn--token-ok"
                : "btn api4com-bdr-action-btn"
            }
            onClick={() => setSipModalOpen(true)}
          >
            {sipConfigured ? (
              <>
                Senha SIP cadastrada
                <Check size={16} aria-hidden className="api4com-bdr-btn-check" />
              </>
            ) : (
              "Senha SIP (discador)"
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
            Use o ramal do seu usuário no painel API4COM (menu Usuários). Salve para aplicar.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
          <button type="button" className="btn btn-primary" onClick={() => setExtensionModalOpen(false)}>
            Concluir
          </button>
        </div>
      </CadastroModal>

      {onSipPasswordChange ? (
        <CadastroModal
          open={sipModalOpen}
          title={sipConfigured ? "Alterar senha SIP" : "Configurar senha SIP"}
          onClose={() => setSipModalOpen(false)}
        >
          <div className="field">
            <label className="label">Senha SIP do ramal</label>
            <TokenInput
              value={sipPassword ?? ""}
              onChange={onSipPasswordChange}
              hasApiToken={hasSipPassword}
              placeholder={hasSipPassword ? "•••••••• (preencha para substituir)" : "Senha do Webphone API4COM"}
            />
            {hasSipPassword && onClearSipPassword ? (
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={onClearSipPassword}>
                Remover senha SIP salva
              </button>
            ) : null}
            <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
              Copie do painel API4COM ao instalar o Webphone do usuário. Salve para aplicar.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-primary" onClick={() => setSipModalOpen(false)}>
              Concluir
            </button>
          </div>
        </CadastroModal>
      ) : null}

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
              Cole o token completo e salve. O valor fica apenas no servidor.
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
