"use client";

import { useState } from "react";
import { Eye, EyeOff, HelpCircle } from "lucide-react";

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
        token pessoal, vale o token global (Admin → Variáveis → API4COM).
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

/** Ramal e token API4COM para perfil BDR — campos abertos por botão. */
export function Api4comBdrFields({
  extension,
  onExtensionChange,
  apiToken,
  onApiTokenChange,
  hasApiToken,
  onClearToken,
  clearingToken
}: {
  extension: string;
  onExtensionChange: (value: string) => void;
  apiToken: string;
  onApiTokenChange: (value: string) => void;
  hasApiToken?: boolean;
  onClearToken?: () => void;
  clearingToken?: boolean;
}) {
  const [showExtension, setShowExtension] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const extensionSummary = extension.trim() ? `Ramal: ${extension.trim()}` : "Ramal não definido";
  const tokenSummary = hasApiToken ? "Token cadastrado" : apiToken.trim() ? "Token preenchido (salvar)" : "Token não cadastrado";

  return (
    <div className="api4com-bdr-fields">
      <div className="api4com-bdr-toolbar">
        <span className="label" style={{ margin: 0 }}>
          API4COM (BDR)
        </span>
        <Api4comHelpTooltip />
      </div>
      <div className="api4com-bdr-actions">
        <button
          type="button"
          className="btn"
          aria-expanded={showExtension}
          onClick={() => {
            setShowExtension((v) => !v);
            setShowToken(false);
          }}
        >
          {showExtension ? "Fechar ramal" : "Configurar ramal"}
        </button>
        <button
          type="button"
          className="btn"
          aria-expanded={showToken}
          onClick={() => {
            setShowToken((v) => !v);
            setShowExtension(false);
          }}
        >
          {showToken ? "Fechar token" : "Configurar token"}
        </button>
      </div>
      <p className="muted api4com-bdr-summary">
        {extensionSummary} · {tokenSummary}
      </p>

      {showExtension ? (
        <div className="field api4com-bdr-panel">
          <label className="label">Ramal API4COM</label>
          <input
            className="input"
            value={extension}
            onChange={(e) => onExtensionChange(e.target.value)}
            placeholder="Ex.: 1001"
            autoComplete="off"
          />
        </div>
      ) : null}

      {showToken ? (
        <div className="field api4com-bdr-panel">
          <label className="label">Token de acesso API4COM</label>
          <TokenInput value={apiToken} onChange={onApiTokenChange} hasApiToken={hasApiToken} />
          {hasApiToken && onClearToken ? (
            <button type="button" className="btn" style={{ marginTop: 8 }} onClick={onClearToken} disabled={clearingToken}>
              {clearingToken ? "Removendo…" : "Remover token salvo"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
