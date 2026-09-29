import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { getGooglePlacesApiKey } from "@/lib/google-places-settings";
import { placesTestConnection } from "@/lib/lead-motor/places-api-new";

export async function POST() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const key = await getGooglePlacesApiKey();
  if (!key) {
    return Response.json({ ok: false, error: "Chave Google Places não configurada." }, { status: 400 });
  }

  const result = await placesTestConnection(key);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.message, kind: result.kind }, { status: 400 });
  }

  const count = result.data.places.length;
  return Response.json({
    ok: true,
    message: `Places API (New) OK — 1 Text Search (máscara places.id). ${count ? `${count} resultado(s).` : "Zero resultados (chave válida)."}`,
    places_found: count
  });
}
