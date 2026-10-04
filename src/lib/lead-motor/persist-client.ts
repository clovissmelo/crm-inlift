import { get, run, nowIso } from "@/lib/db";
import { CONTACT_ORIGIN } from "@/lib/contact-origin";
import { pickPrimaryContactRowIndex } from "@/lib/contact-profile-tags";
import type { EnrichmentResult } from "@/lib/lead-motor/enrichment";
import { resolveNomeFantasia } from "@/lib/lead-motor/trade-name";
import type { AnpStation } from "@/lib/lead-motor/anp";

/** Apenas INSERT — nunca altera cliente existente. */
export async function findExistingClientIdByCnpj(cnpj: string): Promise<number | null> {
  const row = await get<{ id: number }>("SELECT id FROM clients WHERE cnpj = @cnpj LIMIT 1", { cnpj });
  return row?.id ?? null;
}

export async function createClientFromLead(input: {
  station: AnpStation;
  enrichment: EnrichmentResult;
  bdr_user_id: number | null;
  product_id: number | null;
  run_id: number;
  google_place_id: string | null;
}): Promise<number> {
  const { station, enrichment, bdr_user_id, product_id, run_id, google_place_id } = input;
  const fuelBrand = station.bandeira?.trim() || station.distribuidora?.trim() || null;
  const anpProductsSummary = station.produtos_anp?.trim() || null;

  const result = await run(
    `
      INSERT INTO clients (
        cnpj, legal_name, trade_name, segment, city, uf, address, website, notes,
        lead_generation_run_id, google_place_id, anp_fuel_brand, anp_white_flag, anp_products_summary,
        bdr_user_id, lead_qualification, in_prospeccao_queue, created_at, updated_at
      ) VALUES (
        @cnpj, @legalName, @tradeName, @segment, @city, @uf, @address, @website, NULL,
        @runId, @googlePlaceId, @fuelBrand, @whiteFlag, @anpProducts,
        @bdrUserId, 'cold', true, @now, @now
      )
    `,
    {
      cnpj: station.cnpj,
      legalName: station.razao_social || null,
      tradeName:
        enrichment.nome_fantasia ||
        resolveNomeFantasia({ razaoSocial: station.razao_social }) ||
        null,
      segment: "Posto de combustível",
      city: station.cidade,
      uf: station.uf,
      address: station.endereco || null,
      website: enrichment.website || null,
      runId: run_id,
      googlePlaceId: google_place_id,
      fuelBrand,
      whiteFlag: station.bandeira_branca,
      anpProducts: anpProductsSummary,
      bdrUserId: bdr_user_id,
      now: nowIso()
    }
  );
  const clientId = result.lastInsertRowid;
  if (!clientId) throw new Error("Falha ao criar cliente");

  if (product_id) {
    const dup = await get<{ ok: number }>(
      "SELECT 1 AS ok FROM client_products WHERE client_id = @clientId AND product_id = @productId",
      { clientId, productId: product_id }
    );
    if (!dup) {
      await run("INSERT INTO client_products (client_id, product_id) VALUES (@clientId, @productId)", {
        clientId,
        productId: product_id
      });
    }
  }

  type ContactDraft = {
    name: string;
    phone: string | null;
    job_title: string | null;
    origin: string;
    profile_tags?: string[];
  };

  const contactRows: ContactDraft[] = [];
  const nameKey = (n: string) => n.trim().toLowerCase();

  for (const socio of enrichment.socios_pessoa_fisica ?? []) {
    const name = socio.name.trim();
    if (!name) continue;
    if (contactRows.some((c) => nameKey(c.name) === nameKey(name) && c.job_title === "Sócio")) continue;
    contactRows.push({
      name,
      phone: null,
      job_title: "Sócio",
      origin: "Receita Federal",
      profile_tags: ["Sócio"]
    });
  }

  const defaultPhoneName = enrichment.socio_principal || "Contato";
  for (const p of enrichment.phones) {
    const attachName = enrichment.socio_principal || defaultPhoneName;
    const socioRow = contactRows.find(
      (c) => c.job_title === "Sócio" && nameKey(c.name) === nameKey(attachName) && !c.phone
    );
    if (socioRow) {
      socioRow.phone = p.digits;
      continue;
    }
    if (contactRows.some((c) => c.phone === p.digits)) continue;
    contactRows.push({
      name: defaultPhoneName,
      phone: p.digits,
      job_title: null,
      origin: p.origin
    });
  }

  if (contactRows.length === 0) {
    contactRows.push({
      name: station.razao_social || "Recepção",
      phone: null,
      job_title: null,
      origin: CONTACT_ORIGIN.manual
    });
  }

  const primaryRowIndex = pickPrimaryContactRowIndex(contactRows);
  for (let i = 0; i < contactRows.length; i++) {
    const c = contactRows[i]!;
    const originLabel =
      c.origin === "Google Places"
        ? CONTACT_ORIGIN.googlePlaces
        : c.origin === "Receita Federal"
          ? CONTACT_ORIGIN.receitaFederal
          : c.origin === "Dados da ANP"
            ? "Dados da ANP"
            : CONTACT_ORIGIN.manual;
    await run(
      `
        INSERT INTO contacts (
          client_id, name, job_title, phone, verification_status, origin, is_primary_phone, profile_tags,
          created_at, updated_at
        ) VALUES (
          @clientId, @name, @jobTitle, @phone, 'unverified', @origin, @isPrimary, @profileTags::jsonb, @now, @now
        )
      `,
      {
        clientId,
        name: c.name.slice(0, 200),
        jobTitle: c.job_title,
        phone: c.phone,
        origin: originLabel,
        isPrimary: i === primaryRowIndex,
        profileTags: JSON.stringify(c.profile_tags ?? []),
        now: nowIso()
      }
    );
  }

  return clientId;
}

export async function countExistingCnpjsInCrm(cnpjs: string[]): Promise<number> {
  if (!cnpjs.length) return 0;
  let total = 0;
  const chunk = 100;
  for (let i = 0; i < cnpjs.length; i += chunk) {
    const slice = cnpjs.slice(i, i + chunk);
    const placeholders = slice.map((_, j) => `@p${j}`).join(", ");
    const params: Record<string, string> = {};
    slice.forEach((c, j) => {
      params[`p${j}`] = c;
    });
    const row = await get<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM clients WHERE cnpj IN (${placeholders})`,
      params
    );
    total += Number(row?.c ?? 0);
  }
  return total;
}
