import { get, all, nowIso } from "@/lib/db";
import { formatParticipatesInBrandNetwork, resolveClientFuelDisplay } from "@/lib/client-fuel-display";
import { CONTACT_ORIGIN } from "@/lib/contact-origin";
import { formatPhoneDisplay, normalizeCnpj, phoneDigits } from "@/lib/format";
import { getGooglePlacesApiKey } from "@/lib/google-places-settings";
import { fetchAnpMunicipality, mapAnpRecord, type AnpStation } from "@/lib/lead-motor/anp";
import { enrichFromReceita, mergeEnrichment, type PhoneCandidate } from "@/lib/lead-motor/enrichment";
import { buildGoogleSearchQuery, findPlaceId, getPlaceDetails } from "@/lib/lead-motor/google-places";
import { validateGoogleMatch } from "@/lib/lead-motor/google-validate";
import { isValidCnpjDigits } from "@/lib/lead-motor/utils";
import { scrapePhonesFromGoogleWebsite } from "@/lib/lead-motor/website-phone-scrape";
import {
  buildFlowSnapshot,
  getDefaultFlowForSegment,
  getLeadGenerationFlow,
  type FlowSnapshot
} from "@/lib/lead-generation/flows-repo";
import { googleWebsiteIsInstagram } from "@/lib/lead-generation/google-lead-gate";
import { stepEnabled, type StepRunResult } from "@/lib/lead-generation/item-enrichment-runner";
import { canAttemptGoogleApi, incrementDailyGoogleUsage } from "@/lib/lead-generation/quota";
import { getGoogleCache, upsertGoogleCache } from "@/lib/lead-generation/runs-repo";
import { getProduct } from "@/lib/products";
import { listLeadGenSegments } from "@/lib/lead-generation/segments-repo";
import type { EnrichmentResult } from "@/lib/lead-motor/enrichment";
import type { ReconsultApplyOp, ReconsultFieldChange, ReconsultPreview } from "@/lib/lead-discovery";

type ClientRow = {
  id: number;
  cnpj: string | null;
  legal_name: string | null;
  trade_name: string | null;
  city: string | null;
  uf: string | null;
  address: string | null;
  website: string | null;
  google_place_id: string | null;
  anp_fuel_brand: string | null;
  anp_white_flag: boolean | null;
  anp_products_summary: string | null;
};

type ContactRow = {
  id: number;
  name: string;
  job_title: string | null;
  phone: string | null;
  origin: string | null;
};

function normText(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/\s+/g, " ");
}

function normCmp(v: string | null | undefined): string {
  return normText(v).toLowerCase();
}

function emptyStation(cnpj: string, client: ClientRow): AnpStation {
  return {
    cnpj,
    razao_social: client.legal_name ?? "",
    nome_fantasia: client.trade_name ?? "",
    bandeira: client.anp_fuel_brand ?? "",
    bandeira_branca: client.anp_white_flag === true,
    endereco: client.address ?? "",
    logradouro: client.address ?? "",
    numero: "",
    bairro: "",
    cidade: client.city ?? "",
    uf: client.uf ?? "",
    cep: "",
    autorizacao_anp: "",
    situacao_anp: "",
    distribuidora: "",
    produtos_anp: client.anp_products_summary ?? "",
    latitude: "",
    longitude: "",
    anp_segment: "retail"
  };
}

async function loadAnpStation(cnpj: string, client: ClientRow): Promise<AnpStation> {
  const city = client.city?.trim();
  const uf = client.uf?.trim()?.toUpperCase();
  if (city && uf) {
    try {
      const rows = await fetchAnpMunicipality(city, uf);
      for (const raw of rows) {
        const st = mapAnpRecord(raw, city, uf);
        if (st?.cnpj === cnpj) return st;
      }
    } catch {
      /* fallback abaixo */
    }
  }
  return emptyStation(cnpj, client);
}

async function resolveFlowForClient(clientId: number): Promise<{
  snapshot: FlowSnapshot;
  flowLabel: string;
  productName: string | null;
}> {
  const link = await get<{ product_id: number }>(
    "SELECT product_id FROM client_products WHERE client_id = @clientId ORDER BY product_id LIMIT 1",
    { clientId }
  );
  let productFlowId: number | null = null;
  let segmentSlug = "all";
  let productName: string | null = null;
  if (link?.product_id) {
    const product = await getProduct(link.product_id);
    productName = product?.name ?? null;
    if (product?.lead_gen_segment_slug) segmentSlug = product.lead_gen_segment_slug;
    if (product?.lead_gen_flow_id) productFlowId = product.lead_gen_flow_id;
  }
  const segments = await listLeadGenSegments({ activeOnly: true });
  const segmentRow = segments.find((s) => s.slug === segmentSlug);
  const flow =
    (productFlowId ? await getLeadGenerationFlow(productFlowId) : null) ??
    (segmentRow?.default_flow_id ? await getLeadGenerationFlow(segmentRow.default_flow_id) : null) ??
    (await getDefaultFlowForSegment(segmentSlug));
  if (!flow?.active) {
    throw new Error("Fluxo de geração não configurado ou inativo para este produto.");
  }
  return {
    snapshot: buildFlowSnapshot(flow),
    flowLabel: flow.name,
    productName
  };
}

async function registerGoogleAttempt(attemptsSoFar: number): Promise<{ ok: true; next: number } | { ok: false; message: string }> {
  const gate = await canAttemptGoogleApi(attemptsSoFar);
  if (!gate.ok) return { ok: false, message: gate.error_message };
  await incrementDailyGoogleUsage(1);
  return { ok: true, next: attemptsSoFar + 1 };
}

async function runMotorEnrichment(
  station: AnpStation,
  snapshot: FlowSnapshot,
  cnpj: string,
  presetPlaceId: string | null
) {
  const stepLog: StepRunResult[] = [];
  const hasCnpj = isValidCnpjDigits(cnpj);
  let googleAttempts = 0;

  const apiKey = await getGooglePlacesApiKey();
  let googleSnap: {
    place_id: string;
    phone_digits: string;
    phone_display: string;
    website: string;
    name: string;
    formatted_address: string;
  } | null = null;

  const doGoogleSearch = stepEnabled(snapshot, "google_place_search") && !presetPlaceId;
  const doGoogleDetails = stepEnabled(snapshot, "google_place_details");

  if (apiKey && (doGoogleSearch || doGoogleDetails)) {
    if (hasCnpj) {
      const cache = await getGoogleCache(cnpj);
      if (cache?.payload_json && typeof cache.payload_json === "object") {
        const p = cache.payload_json as Record<string, unknown>;
        if (p.phone_digits || p.place_id) {
          googleSnap = {
            place_id: String(cache.place_id ?? p.place_id ?? ""),
            phone_digits: String(p.phone_digits ?? ""),
            phone_display: String(p.phone_display ?? ""),
            website: String(p.website ?? ""),
            name: String(p.name ?? ""),
            formatted_address: String(p.formatted_address ?? "")
          };
          stepLog.push({ step_key: "google_place_search", status: "skipped", message: "Cache" });
        }
      }
    }

    if (!googleSnap && doGoogleSearch) {
      const gate = await registerGoogleAttempt(googleAttempts);
      if (!gate.ok) throw new Error(gate.message);
      googleAttempts = gate.next;
      const query = buildGoogleSearchQuery(station);
      const found = await findPlaceId(apiKey, query, station);
      if (!found) {
        stepLog.push({ step_key: "google_place_search", status: "error", message: "Sem correspondência" });
      } else {
        const match = validateGoogleMatch(station, found.name, found.formatted_address);
        if (match === "approved") {
          presetPlaceId = found.place_id;
          stepLog.push({ step_key: "google_place_search", status: "ok" });
        } else {
          stepLog.push({
            step_key: "google_place_search",
            status: "error",
            message: match === "ambiguous" ? "Incerta" : "Rejeitada"
          });
        }
      }
    } else if (presetPlaceId && !doGoogleSearch) {
      stepLog.push({ step_key: "google_place_search", status: "na", message: "Place ID já conhecido" });
    }

    const placeForDetails = presetPlaceId ?? googleSnap?.place_id;
    if (doGoogleDetails && placeForDetails && !googleSnap) {
      const gate = await registerGoogleAttempt(googleAttempts);
      if (!gate.ok) throw new Error(gate.message);
      googleAttempts = gate.next;
      const details = await getPlaceDetails(apiKey, placeForDetails);
      if (details) {
        googleSnap = {
          place_id: details.place_id,
          phone_digits: details.phone_digits,
          phone_display: details.phone_display,
          website: details.website,
          name: details.name,
          formatted_address: details.formatted_address
        };
        stepLog.push({ step_key: "google_place_details", status: "ok" });
        if (hasCnpj) {
          await upsertGoogleCache(cnpj, details.place_id, {
            ...details,
            collected_at: nowIso(),
            source: "Google Places"
          });
        }
      } else {
        stepLog.push({ step_key: "google_place_details", status: "error", message: "Detalhes indisponíveis" });
      }
    } else if (doGoogleDetails && !placeForDetails) {
      stepLog.push({ step_key: "google_place_details", status: "na", message: "Sem Place ID" });
    }
  } else if (stepEnabled(snapshot, "google_place_search") && !apiKey) {
    stepLog.push({ step_key: "google_place_search", status: "na", message: "Google não configurado" });
  }

  let receita: Awaited<ReturnType<typeof enrichFromReceita>> = {};
  if (stepEnabled(snapshot, "receita_cnpj") && hasCnpj) {
    try {
      receita = await enrichFromReceita(cnpj, false);
      stepLog.push({ step_key: "receita_cnpj", status: Object.keys(receita).length ? "ok" : "skipped" });
    } catch {
      receita = {};
      stepLog.push({ step_key: "receita_cnpj", status: "error" });
    }
  }

  let websitePhonesFromGoogle: PhoneCandidate[] = [];
  if (stepEnabled(snapshot, "website_enrich")) {
    const siteFromGoogle = googleSnap?.website?.trim() ?? "";
    if (!googleSnap?.place_id || !siteFromGoogle) {
      stepLog.push({ step_key: "website_enrich", status: "na", message: "Sem site no Google Places" });
    } else if (googleWebsiteIsInstagram(siteFromGoogle)) {
      stepLog.push({ step_key: "website_enrich", status: "na", message: "Link do Google é Instagram" });
    } else {
      try {
        websitePhonesFromGoogle = await scrapePhonesFromGoogleWebsite(siteFromGoogle);
        stepLog.push({
          step_key: "website_enrich",
          status: websitePhonesFromGoogle.length ? "ok" : "skipped",
          message: websitePhonesFromGoogle.length ? undefined : "Nenhum telefone no site"
        });
      } catch {
        stepLog.push({ step_key: "website_enrich", status: "error", message: "Falha ao acessar o site" });
      }
    }
  }

  const enrichment = mergeEnrichment(station, receita, googleSnap, websitePhonesFromGoogle);
  return { enrichment, googleSnap, station, stepLog };
}

function pushClientField(
  changes: ReconsultFieldChange[],
  key: string,
  label: string,
  current: string | null,
  incoming: string | null,
  origin: string | null,
  apply: ReconsultApplyOp | null
) {
  if (normCmp(current) === normCmp(incoming)) return;
  if (!incoming?.trim() && !current?.trim()) return;
  changes.push({
    key,
    field: key,
    label,
    current: current?.trim() || null,
    incoming: incoming?.trim() || null,
    kind: current?.trim() ? "replace" : "new",
    origin,
    apply
  });
}

function formatProductsList(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("; ");
}

function buildChanges(
  client: ClientRow,
  contacts: ContactRow[],
  station: AnpStation,
  enrichment: EnrichmentResult,
  googleSnap: { formatted_address?: string; place_id?: string } | null
): ReconsultFieldChange[] {
  const changes: ReconsultFieldChange[] = [];
  const display = resolveClientFuelDisplay(client);

  pushClientField(
    changes,
    "trade_name",
    "Nome fantasia",
    client.trade_name,
    enrichment.nome_fantasia || station.nome_fantasia,
    "ANP / Receita",
    { op: "set_client", field: "trade_name", value: enrichment.nome_fantasia || station.nome_fantasia }
  );

  pushClientField(
    changes,
    "legal_name",
    "Razão social",
    client.legal_name,
    station.razao_social,
    "ANP",
    { op: "set_client", field: "legal_name", value: station.razao_social }
  );

  const incomingAddress = googleSnap?.formatted_address?.trim() || station.endereco?.trim() || null;
  pushClientField(changes, "address", "Endereço", client.address, incomingAddress, googleSnap ? "Google Places" : "ANP", {
    op: "set_client",
    field: "address",
    value: incomingAddress ?? ""
  });

  pushClientField(changes, "website", "Site", client.website, enrichment.website || null, "Google Places", {
    op: "set_client",
    field: "website",
    value: enrichment.website || ""
  });

  pushClientField(
    changes,
    "anp_fuel_brand",
    "Bandeira (ANP)",
    client.anp_fuel_brand,
    station.bandeira || station.distribuidora || null,
    "ANP",
    { op: "set_client", field: "anp_fuel_brand", value: station.bandeira || station.distribuidora || "" }
  );

  const curGroup = formatParticipatesInBrandNetwork(display.participatesInBrandNetwork);
  const incGroup = formatParticipatesInBrandNetwork(station.bandeira_branca ? false : station.bandeira ? true : null);
  if (normCmp(curGroup) !== normCmp(incGroup) && incGroup) {
    changes.push({
      key: "anp_white_flag",
      field: "anp_white_flag",
      label: "Participa de grupo",
      current: curGroup,
      incoming: incGroup,
      kind: client.anp_white_flag == null ? "new" : "replace",
      origin: "ANP",
      apply: { op: "set_client_bool", field: "anp_white_flag", value: !station.bandeira_branca }
    });
  }

  const curProd = formatProductsList(client.anp_products_summary);
  const incProd = formatProductsList(station.produtos_anp);
  pushClientField(changes, "anp_products_summary", "Produtos ANP", curProd, incProd, "ANP", {
    op: "set_client",
    field: "anp_products_summary",
    value: station.produtos_anp || ""
  });

  const incomingPlace = googleSnap?.place_id ?? null;
  if (incomingPlace && normCmp(client.google_place_id) !== normCmp(incomingPlace)) {
    changes.push({
      key: "google_place_id",
      field: "google_place_id",
      label: "Google Place ID",
      current: client.google_place_id,
      incoming: incomingPlace,
      kind: client.google_place_id ? "replace" : "new",
      origin: "Google Places",
      apply: { op: "set_client", field: "google_place_id", value: incomingPlace }
    });
  }

  const knownPhones = new Set<string>();
  for (const c of contacts) {
    const d = phoneDigits(c.phone);
    if (d) knownPhones.add(d);
  }

  const knownSocioNames = new Set(
    contacts.filter((c) => normCmp(c.job_title) === "sócio").map((c) => normCmp(c.name))
  );

  for (const p of enrichment.phones) {
    if (!p.digits || knownPhones.has(p.digits)) continue;
    knownPhones.add(p.digits);
    const displayPhone = formatPhoneDisplay(p.digits);
    changes.push({
      key: `phone:${p.digits}`,
      field: "phone",
      label: `Telefone (${p.origin})`,
      current: null,
      incoming: displayPhone,
      kind: "new",
      origin: p.origin,
      apply: {
        op: "add_contact",
        name: p.contact_name || enrichment.socio_principal || "Contato",
        phone: p.digits,
        job_title: null,
        origin: p.origin === "Receita Federal" ? CONTACT_ORIGIN.receitaFederal : p.origin
      }
    });
  }

  for (const socio of enrichment.socios_pessoa_fisica ?? []) {
    const name = socio.name.trim();
    if (!name || knownSocioNames.has(normCmp(name))) continue;
    knownSocioNames.add(normCmp(name));
    changes.push({
      key: `socio:${normCmp(name)}`,
      field: "socio",
      label: "Sócio (Receita Federal)",
      current: null,
      incoming: name,
      kind: "new",
      origin: "Receita Federal",
      apply: {
        op: "add_contact",
        name,
        phone: null,
        job_title: "Sócio",
        origin: CONTACT_ORIGIN.receitaFederal
      }
    });
  }

  return changes;
}

export async function previewClientReconsult(clientId: number): Promise<ReconsultPreview> {
  const client = await get<ClientRow>(
    `
      SELECT id, cnpj, legal_name, trade_name, city, uf, address, website, google_place_id,
        anp_fuel_brand, anp_white_flag, anp_products_summary
      FROM clients WHERE id = @id
    `,
    { id: clientId }
  );
  if (!client) {
    return { status: "failed", message: "Cliente não encontrado.", changes: [], flow_label: null, product_name: null };
  }

  const cnpj = normalizeCnpj(client.cnpj);
  if (!cnpj) {
    return { status: "failed", message: "Cliente sem CNPJ válido para reconsulta.", changes: [], flow_label: null, product_name: null };
  }

  const contacts = await all<ContactRow>(
    "SELECT id, name, job_title, phone, origin FROM contacts WHERE client_id = @id ORDER BY id",
    { id: clientId }
  );

  let flowLabel: string | null = null;
  let productName: string | null = null;
  try {
    const flow = await resolveFlowForClient(clientId);
    flowLabel = flow.flowLabel;
    productName = flow.productName;
    const station = await loadAnpStation(cnpj, client);
    const presetPlaceId = client.google_place_id?.trim() || null;
    const { enrichment, googleSnap, station: mergedStation, stepLog } = await runMotorEnrichment(
      station,
      flow.snapshot,
      cnpj,
      presetPlaceId
    );
    const changes = buildChanges(client, contacts, mergedStation, enrichment, googleSnap);
    const stepsSummary = stepLog.map((s) => `${s.step_key}: ${s.status}`).join(" · ");
    const scope = [productName, flowLabel].filter(Boolean).join(" · ");
    return {
      status: "ready",
      message: scope
        ? `Fluxo: ${scope}. Etapas: ${stepsSummary || "—"}`
        : `Etapas: ${stepsSummary || "—"}`,
      changes,
      flow_label: flowLabel,
      product_name: productName
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na reconsulta.";
    return { status: "failed", message: msg, changes: [], flow_label: flowLabel, product_name: productName };
  }
}
