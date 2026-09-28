import { get, run, nowIso } from "@/lib/db";
import { CONTACT_ORIGIN } from "@/lib/contact-origin";
import type { EnrichmentResult } from "@/lib/lead-motor/enrichment";
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
  const notes = [
    `Origem: geração de leads #${run_id}`,
    google_place_id ? `Google Place ID: ${google_place_id}` : null,
    station.produtos_anp ? `Produtos ANP: ${station.produtos_anp}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const result = await run(
    `
      INSERT INTO clients (
        cnpj, legal_name, trade_name, segment, city, uf, address, website, notes,
        bdr_user_id, lead_qualification, in_prospeccao_queue, created_at, updated_at
      ) VALUES (
        @cnpj, @legalName, @tradeName, @segment, @city, @uf, @address, @website, @notes,
        @bdrUserId, 'cold', true, @now, @now
      )
    `,
    {
      cnpj: station.cnpj,
      legalName: station.razao_social || null,
      tradeName: enrichment.nome_fantasia || station.razao_social || null,
      segment: "Posto de combustível",
      city: station.cidade,
      uf: station.uf,
      address: station.endereco || null,
      website: enrichment.website || null,
      notes,
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

  const contactRows: Array<{ name: string; phone: string | null; origin: string }> = [];
  if (enrichment.socio_principal) {
    contactRows.push({
      name: enrichment.socio_principal,
      phone: null,
      origin: "Receita Federal"
    });
  }
  for (const p of enrichment.phones) {
    contactRows.push({
      name: enrichment.socio_principal || "Contato",
      phone: p.digits,
      origin: p.origin
    });
  }
  if (contactRows.length === 0) {
    contactRows.push({ name: station.razao_social || "Recepção", phone: null, origin: CONTACT_ORIGIN.manual });
  }

  let primarySet = false;
  for (const c of contactRows) {
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
          client_id, name, phone, verification_status, origin, is_primary_phone, created_at, updated_at
        ) VALUES (
          @clientId, @name, @phone, 'unverified', @origin, @isPrimary, @now, @now
        )
      `,
      {
        clientId,
        name: c.name.slice(0, 200),
        phone: c.phone,
        origin: originLabel,
        isPrimary: !primarySet && Boolean(c.phone),
        now: nowIso()
      }
    );
    if (c.phone) primarySet = true;
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
