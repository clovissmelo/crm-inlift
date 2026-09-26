import { apiErrorText, humanizeApi4comDialError } from "@/lib/api-error-text";
import { getApi4comConfig } from "@/lib/api4com/config";

export type Api4comStartCallPayload = {
  caller: string;
  called: string;
  extension: string;
  metadata: Record<string, string | number | boolean>;
};

export type Api4comStartCallResponse = {
  status?: string;
  message?: string;
  id?: string;
};

export async function api4comStartCall(
  payload: Api4comStartCallPayload,
  apiToken: string
): Promise<Api4comStartCallResponse> {
  const cfg = await getApi4comConfig();
  if (!apiToken) {
    throw new Error(
      "Token API4COM ausente. Cadastre em Meu perfil (BDR) ou peça ao admin (Variáveis / cadastro de usuário)."
    );
  }

  const res = await fetch(`${cfg.baseUrl}/api/v1/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiToken
    },
    body: JSON.stringify(payload)
  });

  const data = (await res.json().catch(() => ({}))) as Api4comStartCallResponse & Record<string, unknown>;
  if (!res.ok) {
    throw new Error(humanizeApi4comDialError(apiErrorText(data, `API4COM respondeu ${res.status}`)));
  }
  if (!data.id) {
    throw new Error(data.message || "API4COM não retornou o ID da chamada.");
  }
  return data;
}

export async function api4comRegisterWebhookIntegration(webhookUrl: string) {
  const cfg = await getApi4comConfig();
  if (!cfg.apiToken) {
    throw new Error("Token API4COM ausente.");
  }

  const payload = {
    gateway: cfg.gateway,
    webhook: true,
    webhookConstraint: {
      metadata: {
        gateway: cfg.gateway
      }
    },
    metadata: {
      webhookUrl,
      webhookVersion: "1.8",
      webhookTypes: ["channel-hangup", "channel-answer"]
    }
  };

  const res = await fetch(`${cfg.baseUrl}/api/v1/integrations`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: cfg.apiToken
    },
    body: JSON.stringify(payload)
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(apiErrorText(data, `Falha ao registrar webhook (${res.status})`));
  }
  return data;
}
