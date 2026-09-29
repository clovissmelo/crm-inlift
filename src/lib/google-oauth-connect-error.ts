export type GoogleOAuthConnectStage =
  | "config"
  | "token_exchange"
  | "missing_refresh_token"
  | "userinfo"
  | "database";

export class GoogleOAuthConnectError extends Error {
  readonly stage: GoogleOAuthConnectStage;
  readonly userMessage: string;

  constructor(stage: GoogleOAuthConnectStage, technicalMessage: string, userMessage: string) {
    super(technicalMessage);
    this.name = "GoogleOAuthConnectError";
    this.stage = stage;
    this.userMessage = userMessage;
  }
}

/** Log técnico no servidor — nunca incluir tokens, código OAuth ou Client Secret. */
export function logGoogleOAuthFailure(stage: GoogleOAuthConnectStage, technicalMessage: string) {
  const safe = technicalMessage.replace(/Bearer\s+\S+/gi, "[redacted]").slice(0, 500);
  console.error(`[google-oauth] stage=${stage} ${safe}`);
}

export function oauthErrorQueryParam(stage: GoogleOAuthConnectStage): string {
  return stage;
}

export function userMessageForOAuthError(code: string | null): string | null {
  switch (code) {
    case "not_configured":
      return "Credenciais OAuth não configuradas. Salve Client ID e Secret acima.";
    case "oauth_denied":
      return "Autorização cancelada no Google.";
    case "invalid_state":
      return "Sessão OAuth expirada. Tente conectar novamente.";
    case "config":
      return "OAuth não configurado no servidor (Client ID, Secret ou redirect).";
    case "token_exchange":
      return "Não foi possível trocar o código de autorização por tokens. Verifique redirect URI no Google Cloud e tente de novo.";
    case "missing_refresh_token":
      return "Google não enviou refresh token. Desconecte o app em myaccount.google.com/permissions e conecte de novo (consentimento completo).";
    case "userinfo":
      return "Conta conectada parcialmente, mas não foi possível ler o e-mail. Reconecte ou confira o escopo userinfo.email no consentimento.";
    case "database":
      return "Tokens recebidos, mas falhou ao gravar no banco. Tente novamente ou contate o administrador.";
    case "token_failed":
      return "Falha ao conectar Google Agenda. Tente novamente.";
    default:
      return code ? "Falha ao conectar Google Agenda." : null;
  }
}
