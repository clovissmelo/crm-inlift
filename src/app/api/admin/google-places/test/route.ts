import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { getGooglePlacesApiKey } from "@/lib/google-places-settings";
import { GOOGLE_PLACES_FIND_URL } from "@/lib/lead-motor/motor-config";

export async function POST() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const key = await getGooglePlacesApiKey();
  if (!key) {
    return Response.json({ ok: false, error: "Chave Google Places não configurada." }, { status: 400 });
  }

  const params = new URLSearchParams({
    input: "ANP Agência Nacional do Petróleo Brasília",
    inputtype: "textquery",
    fields: "place_id,name",
    language: "pt-BR",
    key
  });

  const res = await fetch(`${GOOGLE_PLACES_FIND_URL}?${params}`, { signal: AbortSignal.timeout(15000) });
  const payload = (await res.json()) as { status?: string; error_message?: string; candidates?: unknown[] };
  const status = payload.status ?? "UNKNOWN";
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    return Response.json({
      ok: false,
      error: payload.error_message ?? `Google retornou status ${status}`
    });
  }

  return Response.json({
    ok: true,
    message: "Conexão OK (1 consulta Find Place de teste).",
    candidates: payload.candidates?.length ?? 0
  });
}
