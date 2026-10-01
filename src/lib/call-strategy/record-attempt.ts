import { get, nowIso, run } from "@/lib/db";
import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";
import { getTechnicalResultTypeById } from "@/lib/classifications/technical-result";
import { getContactOutcomeTypeById } from "@/lib/classifications/contact-commercial";
import { syncClientPhonesFromContacts } from "@/lib/call-strategy/client-phones";
import { evaluateProspeccaoQueueAfterAttempt } from "@/lib/call-strategy/queue-eval";
import { resolveDialOccurrencePolicy } from "@/lib/call-strategy/occurrence-policy";
import { applyOccurrenceToPhoneState } from "@/lib/call-strategy/phone-counters";

export async function resolveClientPhoneId(input: {
  clientId: number;
  contactId?: number | null;
  phoneDialed?: string | null;
}): Promise<number | null> {
  await syncClientPhonesFromContacts(input.clientId);
  if (input.phoneDialed) {
    const digits = normalizeApi4comCalledNumber(input.phoneDialed);
    if (digits) {
      const row = await get<{ id: number }>(
        "SELECT id FROM client_phones WHERE client_id = @clientId AND phone_digits = @digits",
        { clientId: input.clientId, digits }
      );
      if (row) return row.id;
    }
  }
  if (input.contactId) {
    const c = await get<{ phone: string | null; whatsapp: string | null }>(
      "SELECT phone, whatsapp FROM contacts WHERE id = @id AND client_id = @clientId",
      { id: input.contactId, clientId: input.clientId }
    );
    if (c) {
      for (const raw of [c.phone, c.whatsapp]) {
        const digits = raw ? normalizeApi4comCalledNumber(raw) : null;
        if (!digits) continue;
        const row = await get<{ id: number }>(
          "SELECT id FROM client_phones WHERE client_id = @clientId AND phone_digits = @digits",
          { clientId: input.clientId, digits }
        );
        if (row) return row.id;
      }
    }
  }
  return null;
}

export async function recordDialAttemptFromApproach(input: {
  approachId: number;
  clientId: number;
  userId: number;
  contactId?: number | null;
  productId?: number | null;
  api4comCallRowId?: number | null;
  resultTypeId: number;
  contactOutcomeTypeId?: number | null;
}): Promise<void> {
  const dupApproach = await get<{ id: number }>(
    "SELECT id FROM phone_dial_attempts WHERE approach_id = @approachId",
    { approachId: input.approachId }
  );
  if (dupApproach) return;

  if (input.api4comCallRowId) {
    const dupCall = await get<{ id: number }>(
      "SELECT id FROM phone_dial_attempts WHERE api4com_call_id = @callId",
      { callId: input.api4comCallRowId }
    );
    if (dupCall) return;
  }

  const commercial = await get<{ slug: string }>(
    "SELECT slug FROM approach_result_types WHERE id = @id",
    { id: input.resultTypeId }
  );
  let technicalSlug: string | null = null;
  let technicalTypeId: number | null = null;
  let phoneDialed: string | null = null;
  if (input.api4comCallRowId) {
    const call = await get<{ technical_result_type_id: number | null; phone_dialed: string }>(
      "SELECT technical_result_type_id, phone_dialed FROM api4com_calls WHERE id = @id",
      { id: input.api4comCallRowId }
    );
    phoneDialed = call?.phone_dialed ?? null;
    technicalTypeId = call?.technical_result_type_id ?? null;
    if (call?.technical_result_type_id) {
      const t = await getTechnicalResultTypeById(call.technical_result_type_id);
      technicalSlug = t?.slug ?? null;
    }
  }
  let contactSlug: string | null = null;
  if (input.contactOutcomeTypeId) {
    const co = await getContactOutcomeTypeById(input.contactOutcomeTypeId);
    contactSlug = co?.slug ?? null;
  }

  const policy = await resolveDialOccurrencePolicy({
    technicalTypeId,
    commercialTypeId: input.resultTypeId,
    contactOutcomeSlug: contactSlug,
    technicalSlug,
    commercialSlug: commercial?.slug ?? null
  });

  const clientPhoneId = await resolveClientPhoneId({
    clientId: input.clientId,
    contactId: input.contactId,
    phoneDialed
  });
  if (!clientPhoneId) {
    await evaluateProspeccaoQueueAfterAttempt(input.clientId);
    return;
  }

  const bucket = policy.kind ?? "unknown";

  await run(
    `
      INSERT INTO phone_dial_attempts (
        client_phone_id, client_id, user_id, api4com_call_id, approach_id, product_id,
        attempt_bucket, occurrence_kind, consumes_cycle, technical_slug, commercial_slug,
        result_registration_association_id, created_at
      ) VALUES (
        @phoneId, @clientId, @userId, @callId, @approachId, @productId,
        @bucket, @kind, @consumes, @tech, @commercial, @assocId, @now
      )
    `,
    {
      phoneId: clientPhoneId,
      clientId: input.clientId,
      userId: input.userId,
      callId: input.api4comCallRowId ?? null,
      approachId: input.approachId,
      productId: input.productId ?? null,
      bucket,
      kind: policy.kind,
      consumes: policy.counts,
      tech: technicalSlug,
      commercial: commercial?.slug ?? null,
      assocId: policy.associationId,
      now: nowIso()
    }
  );

  await applyOccurrenceToPhoneState(clientPhoneId, policy);
  await evaluateProspeccaoQueueAfterAttempt(input.clientId);
}
