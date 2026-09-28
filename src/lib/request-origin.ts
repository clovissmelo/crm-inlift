/** Origem pública do site (para OAuth redirect), a partir do request HTTP. */
export function getRequestOrigin(request: Request): string | undefined {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return undefined;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host.split(",")[0]!.trim()}`;
}
