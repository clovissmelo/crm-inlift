import { getSystemSetting } from "@/lib/system-settings";
import { normalizeSipDomain, isPlausibleApi4comSipDomain } from "@/lib/api4com/sip-domain-shared";

export { normalizeSipDomain, validateApi4comSipDomainInput, isPlausibleApi4comSipDomain } from "@/lib/api4com/sip-domain-shared";

/** Domínio SIP da conta (realm / WSS). Env tem prioridade sobre Admin. */
export async function getApi4comSipDomain(): Promise<string | null> {
  const env = process.env.API4COM_SIP_DOMAIN?.trim();
  if (env) return normalizeSipDomain(env);
  const row = await getSystemSetting("api4com_sip_domain");
  const fromDb = row?.value?.trim();
  return fromDb ? normalizeSipDomain(fromDb) : null;
}

export async function getApi4comSipDomainValidated(): Promise<string | null> {
  const d = await getApi4comSipDomain();
  return isPlausibleApi4comSipDomain(d) ? d : null;
}
