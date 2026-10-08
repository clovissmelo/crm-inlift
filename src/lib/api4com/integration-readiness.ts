import { getApi4comConfig, isApi4comIntegrationTokenConfigured } from "@/lib/api4com/config";
import { isPlausibleApi4comSipDomain } from "@/lib/api4com/sip-domain-shared";
import { getApi4comSipDomain } from "@/lib/api4com/sip-domain";
import { getApi4comTokenPolicy } from "@/lib/api4com/token-policy";
import { resolveApi4comTokenForAdminApiOperations } from "@/lib/api4com/user-token";
import { get } from "@/lib/db";

export type Api4comIntegrationReadiness = {
  token_policy: "global" | "per_bdr";
  integration_token_configured: boolean;
  any_bdr_token_configured: boolean;
  can_query_api: boolean;
  sip_domain_configured: boolean;
  sip_domain_current: string | null;
  base_url: string;
};

export async function getApi4comIntegrationReadiness(adminUserId: number): Promise<Api4comIntegrationReadiness> {
  const token_policy = await getApi4comTokenPolicy();
  const integration_token_configured = await isApi4comIntegrationTokenConfigured();
  const row = await get<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM users
     WHERE status = 'active'
       AND api4com_api_token IS NOT NULL
       AND trim(api4com_api_token) <> ''`
  );
  const any_bdr_token_configured = (row?.n ?? 0) > 0;
  const can_query_api = Boolean(await resolveApi4comTokenForAdminApiOperations(adminUserId));
  const sip_domain_current = await getApi4comSipDomain();
  const cfg = await getApi4comConfig();

  return {
    token_policy,
    integration_token_configured,
    any_bdr_token_configured,
    can_query_api,
    sip_domain_configured: isPlausibleApi4comSipDomain(sip_domain_current),
    sip_domain_current,
    base_url: cfg.baseUrl
  };
}
