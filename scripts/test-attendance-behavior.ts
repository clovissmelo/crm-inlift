/**
 * Validações do motor de atendimento/prospecção (sem produção).
 * npx tsx scripts/test-attendance-behavior.ts
 */
import assert from "node:assert/strict";
import { enforceRulesForAction } from "../src/lib/attendance/operational-actions";
import { readCountForKind } from "../src/lib/call-strategy/phone-counters";
import type { DialOccurrencePolicy } from "../src/lib/call-strategy/occurrence-policy-shared";
import { queuePriorityToSlug } from "../src/lib/call-strategy/priorities-config";

function applyPolicyToCounts(
  state: {
    cycle_no_contact_count: number;
    cycle_no_answer_count: number;
    cycle_invalid_count: number;
    cycle_wrong_number_count: number;
  },
  policy: DialOccurrencePolicy
) {
  const next = { ...state };
  if (!policy.counts || !policy.kind || policy.kind === "conversation_success") return next;
  if (policy.kind === "technical_fail") return next;
  const kind = policy.kind === "no_answer" ? "no_contact" : policy.kind;
  if (kind === "no_contact") next.cycle_no_contact_count += 1;
  else if (kind === "invalid") next.cycle_invalid_count += 1;
  else if (kind === "wrong_number") next.cycle_wrong_number_count += 1;
  return next;
}

function testUnifiedNoContactCounter() {
  let state = {
    cycle_no_contact_count: 0,
    cycle_no_answer_count: 0,
    cycle_invalid_count: 0,
    cycle_wrong_number_count: 0
  };
  const policy: DialOccurrencePolicy = {
    counts: true,
    kind: "no_contact",
    limit: 3,
    minIntervalMinutes: 60,
    limitAction: "exhaust_phone",
    associationId: null
  };
  state = applyPolicyToCounts(state, policy);
  state = applyPolicyToCounts(state, policy);
  state = applyPolicyToCounts(state, policy);
  assert.equal(readCountForKind(state, "no_contact"), 3, "2 não atendimentos + 1 URA = 3 tentativas");
}

function testTechnicalFailDoesNotIncrement() {
  const state = {
    cycle_no_contact_count: 2,
    cycle_no_answer_count: 2,
    cycle_invalid_count: 0,
    cycle_wrong_number_count: 0
  };
  const next = applyPolicyToCounts(state, {
    counts: false,
    kind: "technical_fail",
    limit: 0,
    minIntervalMinutes: 60,
    limitAction: "exhaust_phone",
    associationId: null
  });
  assert.equal(next.cycle_no_contact_count, 2);
  assert.equal(next.cycle_invalid_count, 0);
}

function testSemInteresseExitsProductOnly() {
  const rules = enforceRulesForAction("sem_interesse");
  assert.equal(rules.exit_prospeccao_product, true);
  assert.equal(rules.move_pipeline_lost, true);
  const interest = enforceRulesForAction("demonstrou_interesse");
  assert.equal(interest.exit_prospeccao_product, false);
}

function testReuniaoAgendadaExitsQueueNotLost() {
  const rules = enforceRulesForAction("reuniao_agendada");
  assert.equal(rules.exit_prospeccao_product, true);
  assert.equal(rules.move_pipeline_lost, false);
  assert.equal(rules.requires_meeting, true);
}

function testQueuePrioritySlugMapping() {
  assert.equal(queuePriorityToSlug(0), "reagendar");
  assert.equal(queuePriorityToSlug(3), "primeiro_contato");
}

async function testResolvePolicyWithDb() {
  if (!process.env.DATABASE_URL) {
    console.log("skip DB: resolveDialOccurrencePolicy (sem DATABASE_URL)");
    return;
  }
  const { resolveDialOccurrencePolicy } = await import("../src/lib/call-strategy/occurrence-policy");
  const { get } = await import("../src/lib/db");
  const semContato = await get<{ id: number }>(
    "SELECT id FROM approach_result_types WHERE slug = 'sem_contato' AND status = 'active' LIMIT 1"
  );
  if (!semContato) {
    console.log("skip DB: catálogo sem_contato ausente");
    return;
  }
  const noAnswer = await resolveDialOccurrencePolicy({
    technicalTypeId: null,
    commercialTypeId: semContato.id,
    contactOutcomeSlug: "nenhum_contato",
    technicalSlug: "no_answer",
    commercialSlug: "sem_contato"
  });
  assert.equal(noAnswer.kind, "no_contact");
  assert.equal(noAnswer.counts, true);

  const failed = await resolveDialOccurrencePolicy({
    technicalTypeId: null,
    commercialTypeId: semContato.id,
    contactOutcomeSlug: null,
    technicalSlug: "call_failed",
    commercialSlug: "sem_contato"
  });
  assert.equal(failed.counts, false);
}

function main() {
  testUnifiedNoContactCounter();
  testTechnicalFailDoesNotIncrement();
  testSemInteresseExitsProductOnly();
  testReuniaoAgendadaExitsQueueNotLost();
  testQueuePrioritySlugMapping();
  console.log("test-attendance-behavior: OK (unit)");
}

main();
void testResolvePolicyWithDb().then(() => {
  console.log("test-attendance-behavior: DB checks done");
});
