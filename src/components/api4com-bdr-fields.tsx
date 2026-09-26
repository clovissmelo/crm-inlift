"use client";

/** Campos e instruções API4COM exibidos apenas para perfil BDR (ramal + token pessoal). */

export function Api4comBdrFields({
  extension,
  onExtensionChange,
  apiToken,
  onApiTokenChange,
  hasApiToken,
  compact = false
}: {
  extension: string;
  onExtensionChange: (value: string) => void;
  apiToken: string;
  onApiTokenChange: (value: string) => void;
  hasApiToken?: boolean;
  compact?: boolean;
}) {
  const hintSize = compact ? "0.75rem" : "0.8125rem";

  return (
    <div className="api4com-bdr-fields">
      <div className="field">
        <label className="label">Ramal API4COM</label>
        <input
          className="input"
          value={extension}
          onChange={(e) => onExtensionChange(e.target.value)}
          placeholder="Ex.: 1001"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label className="label">Token de acesso API4COM</label>
        <input
          className="input"
          type="password"
          value={apiToken}
          onChange={(e) => onApiTokenChange(e.target.value)}
          placeholder={hasApiToken ? "•••••••• (preencha para substituir)" : "Cole o token completo"}
          autoComplete="off"
        />
      </div>
      <div className="muted" style={{ fontSize: hintSize, lineHeight: 1.45 }}>
        <p style={{ margin: "0 0 0.5rem" }}>
          <strong>Como obter o token:</strong> acesse{" "}
          <a href="https://app.api4com.com/user/tokens" target="_blank" rel="noreferrer">
            app.api4com.com → Tokens de acesso
          </a>
          , copie a string completa da coluna Token (ou use <em>Novo token de acesso</em> se expirou) e cole acima. O
          CRM guarda isso só no servidor; não compartilhe em chat ou e-mail.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Ramal:</strong> no painel API4COM, em <em>Usuários</em>, confira o ramal vinculado ao seu usuário. Não
          é necessário cadastrar senha SIP aqui. Se não houver token pessoal, o CRM usa o token global (Admin →
          Variáveis → API4COM).
        </p>
      </div>
    </div>
  );
}
