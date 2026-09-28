import { getSystemSetting } from "@/lib/system-settings";
import { decryptSecret, encryptSecret } from "@/lib/token-crypto";

const ID_KEY = "google_oauth_client_id";
const SECRET_KEY = "google_oauth_client_secret";
const REDIRECT_KEY = "google_oauth_redirect_uri";

export function encryptGoogleOAuthSecretForStorage(plain: string): string {
  return encryptSecret(plain.trim());
}

export async function getGoogleOAuthClientCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const idRow = await getSystemSetting(ID_KEY);
  const secretRow = await getSystemSetting(SECRET_KEY);
  const clientId = idRow?.value?.trim() ?? "";
  const rawSecret = secretRow?.value?.trim();
  if (!clientId || !rawSecret) return null;
  let clientSecret: string;
  try {
    clientSecret = decryptSecret(rawSecret);
  } catch {
    clientSecret = rawSecret;
  }
  if (!clientSecret) return null;
  return { clientId, clientSecret };
}

/** URI cadastrada no Google Cloud; se vazia, usa a origem da requisição. */
export async function resolveGoogleOAuthRedirectUri(requestOrigin?: string): Promise<string | null> {
  const row = await getSystemSetting(REDIRECT_KEY);
  const configured = row?.value?.trim();
  if (configured) return configured;

  if (requestOrigin) {
    const base = requestOrigin.replace(/\/$/, "");
    return `${base}/api/integrations/google/callback`;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000/api/integrations/google/callback";
  }

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) return `https://${vercelHost}/api/integrations/google/callback`;

  return null;
}

export async function isGoogleOAuthConfiguredInApp(requestOrigin?: string): Promise<boolean> {
  const creds = await getGoogleOAuthClientCredentials();
  const redirect = await resolveGoogleOAuthRedirectUri(requestOrigin);
  return Boolean(creds && redirect);
}
