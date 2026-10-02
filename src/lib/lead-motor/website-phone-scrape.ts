import type { PhoneCandidate } from "@/lib/lead-motor/enrichment";
import { normalizePhoneDigits } from "@/lib/lead-motor/utils";

const FETCH_TIMEOUT_MS = 18_000;
const MAX_HTML_CHARS = 600_000;

/** Normaliza URL pública http(s) a partir do websiteUri do Google Places. */
export function resolveWebsiteFetchUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = trimmed.match(/^https?:\/\//i) ? new URL(trimmed) : new URL(`https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return null;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return null;
  return url.toString();
}

function collectDigitCandidates(raw: string, out: Set<string>) {
  const digits = normalizePhoneDigits(raw);
  if (digits) out.add(digits);
}

/** Extrai telefones BR de HTML (tel: links e padrões comuns no texto). */
export function extractPhonesFromWebsiteHtml(html: string): string[] {
  const found = new Set<string>();

  const telHref = /href\s*=\s*["']tel:([^"'#?]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = telHref.exec(html)) !== null) {
    collectDigitCandidates(decodeURIComponent(m[1] ?? ""), found);
  }

  const textish = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const brPatterns = [
    /\+55[\s(]*\d{2}[\s).-]*(?:9?\d{4})[\s.-]*\d{4}/g,
    /\(\d{2}\)\s*(?:9?\d{4})[\s.-]*\d{4}/g,
    /\b\d{2}\s*(?:9?\d{4})[\s.-]*\d{4}\b/g
  ];
  for (const re of brPatterns) {
    re.lastIndex = 0;
    while ((m = re.exec(textish)) !== null) {
      collectDigitCandidates(m[0] ?? "", found);
    }
  }

  return [...found];
}

export async function scrapePhonesFromGoogleWebsite(siteUrl: string): Promise<PhoneCandidate[]> {
  const fetchUrl = resolveWebsiteFetchUrl(siteUrl);
  if (!fetchUrl) return [];

  const res = await fetch(fetchUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "User-Agent": "InliftCRM/1.0 (lead enrichment; +https://inlift.com.br)"
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow"
  });
  if (!res.ok) return [];

  const reader = res.body?.getReader();
  if (!reader) {
    const text = (await res.text()).slice(0, MAX_HTML_CHARS);
    return extractPhonesFromWebsiteHtml(text).map((digits) => ({
      digits,
      origin: "Site (Google Places)",
      contact_name: null
    }));
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let html = "";
  while (html.length < MAX_HTML_CHARS) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    if (html.length >= MAX_HTML_CHARS) {
      html = html.slice(0, MAX_HTML_CHARS);
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
  }

  return extractPhonesFromWebsiteHtml(html).map((digits) => ({
    digits,
    origin: "Site (Google Places)",
    contact_name: null
  }));
}
