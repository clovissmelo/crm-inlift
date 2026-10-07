import { getSystemSetting } from "@/lib/system-settings";

function normalizeSipDomain(raw: string): string {
  let d = raw.trim();
  d = d.replace(/^wss:\/\//i, "");
  d = d.replace(/:\d+$/, "");
  d = d.replace(/\/$/, "");
  return d;
}

/** Domínio SIP da conta (realm / WSS). Env tem prioridade sobre Admin. */
export async function getApi4comSipDomain(): Promise<string | null> {
  const env = process.env.API4COM_SIP_DOMAIN?.trim();
  if (env) return normalizeSipDomain(env);
  const row = await getSystemSetting("api4com_sip_domain");
  const fromDb = row?.value?.trim();
  return fromDb ? normalizeSipDomain(fromDb) : null;
}
