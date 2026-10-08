export function normalizeSipDomain(raw: string): string {
  let d = raw.trim();
  d = d.replace(/^https?:\/\//i, "");
  d = d.replace(/^wss:\/\//i, "");
  d = d.replace(/\/.*$/, "");
  d = d.replace(/:\d+$/, "");
  d = d.replace(/\/$/, "");
  return d;
}

export function validateApi4comSipDomainInput(raw: string): { ok: true; normalized: string } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Informe o domínio SIP da conta API4COM (ex.: inlift.api4com.com)." };
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes("/api/webhooks") || trimmed.includes("vercel.app")) {
    return {
      ok: false,
      message:
        "Esse valor parece a URL do webhook do CRM, não o domínio SIP. Use só o domínio VoIP, ex.: minhaempresa.api4com.com (sem https)."
    };
  }
  const normalized = normalizeSipDomain(trimmed);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    return { ok: false, message: "Domínio SIP inválido. Ex.: minhaempresa.api4com.com" };
  }
  return { ok: true, normalized };
}

export function isPlausibleApi4comSipDomain(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  return validateApi4comSipDomainInput(raw).ok;
}
