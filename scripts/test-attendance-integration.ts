/**
 * Testes de integração (PostgreSQL dev separado — nunca produção).
 * POSTGRES_URL ou DATABASE_URL deve apontar para banco de teste (ex.: crm_inlift_test).
 *
 * npx tsx scripts/test-attendance-integration.ts
 */
import assert from "node:assert/strict";
import postgres from "postgres";

const TEST_DB_HINT = "crm_inlift_test";

function getSql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Defina POSTGRES_URL ou DATABASE_URL para o banco de teste.");
  }
  if (/prod|production|supabase\.co/i.test(url) && !process.env.ALLOW_PROD_TEST) {
    throw new Error("Recusado: URL parece produção. Use banco de teste ou ALLOW_PROD_TEST=1.");
  }
  if (!url.includes(TEST_DB_HINT) && !process.env.ALLOW_ANY_TEST_DB) {
    console.warn(
      `Aviso: URL não contém "${TEST_DB_HINT}". Exporte ALLOW_ANY_TEST_DB=1 para confirmar outro banco dev.`
    );
    throw new Error("Banco de teste não confirmado.");
  }
  return postgres(url, { max: 1, prepare: false });
}

async function countMigrations(sql: postgres.Sql) {
  const rows = await sql<{ id: string }[]>`SELECT id FROM schema_migrations ORDER BY id`;
  return rows.map((r) => r.id);
}

async function testMigrationIdempotent(sql: postgres.Sql) {
  const { execSync } = await import("node:child_process");
  execSync("npm run migrate", { stdio: "inherit", env: process.env });
  const after1 = await countMigrations(sql);
  execSync("npm run migrate", { stdio: "inherit", env: process.env });
  const after2 = await countMigrations(sql);
  assert.deepEqual(after2, after1, "Segunda execução de migrate não deve alterar schema_migrations");
  assert.ok(after2.some((id) => id.includes("039")), "Migração 039 deve constar como aplicada");
}

async function testProductIsolation(sql: postgres.Sql) {
  const client = await sql<{ id: number }[]>`
    INSERT INTO clients (legal_name, trade_name, in_prospeccao_queue, lead_qualification)
    VALUES ('Teste CPP A/B', 'Teste CPP', true, 'cold') RETURNING id
  `;
  const clientId = client[0]!.id;
  const products = await sql<{ id: number }[]>`SELECT id FROM products ORDER BY id LIMIT 2`;
  assert.ok(products.length >= 2, "Precisa de 2 produtos seed");
  const [pA, pB] = products;

  await sql`
    INSERT INTO client_product_prospeccao (client_id, product_id, in_prospeccao_queue)
    VALUES (${clientId}, ${pA.id}, true), (${clientId}, ${pB.id}, true)
    ON CONFLICT DO NOTHING
  `;

  const { exitProspeccaoForProduct } = await import("../src/lib/client-product-prospeccao");
  await exitProspeccaoForProduct(clientId, pA.id, "sem_interesse");

  const rows = await sql<{ product_id: number; in_prospeccao_queue: boolean; exit_reason: string | null }[]>`
    SELECT product_id, in_prospeccao_queue, exit_reason FROM client_product_prospeccao
    WHERE client_id = ${clientId} ORDER BY product_id
  `;
  const a = rows.find((r) => r.product_id === pA.id);
  const b = rows.find((r) => r.product_id === pB.id);
  assert.equal(a?.in_prospeccao_queue, false);
  assert.equal(a?.exit_reason, "sem_interesse");
  assert.equal(b?.in_prospeccao_queue, true);

  await sql`DELETE FROM client_product_prospeccao WHERE client_id = ${clientId}`;
  await sql`DELETE FROM clients WHERE id = ${clientId}`;
}

async function testDuplicateAttemptGuard(sql: postgres.Sql) {
  const phone = await sql<{ id: number; client_id: number }[]>`
    SELECT cp.id, cp.client_id FROM client_phones cp LIMIT 1
  `;
  if (!phone.length) {
    console.log("skip: testDuplicateAttemptGuard (sem client_phones)");
    return;
  }
  const { id: phoneId, client_id: clientId } = phone[0]!;
  const callInsert = await sql<{ id: number }[]>`
    INSERT INTO api4com_calls (user_id, client_id, phone_dialed, status, api4com_call_id, started_at)
    SELECT u.id, ${clientId}, '11999999999', 'completed', ${"test-dup-" + Date.now()}, now()
    FROM users u LIMIT 1
    RETURNING id
  `;
  const callId = callInsert[0]!.id;
  const approach = await sql<{ id: number }[]>`
    INSERT INTO approaches (client_id, user_id, channel, result_type_id, occurred_at, registration_status)
    SELECT ${clientId}, u.id, 'call', art.id, now(), 'final'
    FROM users u, approach_result_types art
    WHERE art.slug = 'sem_contato' AND art.status = 'active'
    LIMIT 1
    RETURNING id
  `;
  const approachId = approach[0]!.id;

  const { recordDialAttemptFromApproach } = await import("../src/lib/call-strategy/record-attempt");
  await recordDialAttemptFromApproach({
    approachId,
    clientId,
    userId: 1,
    api4comCallRowId: callId,
    resultTypeId: (await sql<{ id: number }[]>`SELECT id FROM approach_result_types WHERE slug='sem_contato' LIMIT 1`)[0]!
      .id,
    contactOutcomeTypeId: (
      await sql<{ id: number }[]>`SELECT id FROM contact_outcome_types WHERE slug='nenhum_contato' LIMIT 1`
    )[0]?.id
  });
  await recordDialAttemptFromApproach({
    approachId,
    clientId,
    userId: 1,
    api4comCallRowId: callId,
    resultTypeId: (await sql<{ id: number }[]>`SELECT id FROM approach_result_types WHERE slug='sem_contato' LIMIT 1`)[0]!
      .id
  });

  const cnt = await sql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM phone_dial_attempts WHERE api4com_call_id = ${callId}
  `;
  assert.equal(Number(cnt[0]?.c), 1, "Mesma ligação não deve gerar duas tentativas");

  await sql`DELETE FROM phone_dial_attempts WHERE api4com_call_id = ${callId}`;
  await sql`DELETE FROM approaches WHERE id = ${approachId}`;
  await sql`DELETE FROM api4com_calls WHERE id = ${callId}`;
}

async function testFutureReturnExcludedFromQueue(sql: postgres.Sql) {
  const { queryProspeccaoQueue } = await import("../src/lib/prospeccao-query");
  const client = await sql<{ id: number }[]>`
    INSERT INTO clients (legal_name, trade_name, in_prospeccao_queue, lead_qualification)
    VALUES ('Retorno Futuro', 'Retorno Futuro', true, 'cold') RETURNING id
  `;
  const clientId = client[0]!.id;
  const user = await sql<{ id: number }[]>`SELECT id FROM users LIMIT 1`;
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await sql`
    INSERT INTO follow_ups (client_id, user_id, scheduled_at, status, notes)
    VALUES (${clientId}, ${user[0]!.id}, ${future}, 'pending', 'retorno futuro')
  `;
  const { items } = await queryProspeccaoQueue({ limit: 500 });
  assert.ok(!items.some((i) => i.id === clientId), "Retorno só futuro não deve aparecer na fila imediata");
  await sql`DELETE FROM follow_ups WHERE client_id = ${clientId}`;
  await sql`DELETE FROM clients WHERE id = ${clientId}`;
}

async function main() {
  const sql = getSql();
  try {
    console.log("=== migrate (1ª vez) ===");
    await testMigrationIdempotent(sql);
    console.log("PASS migration idempotent + 039 present");

    await testProductIsolation(sql);
    console.log("PASS produto A sem interesse preserva B na fila");

    await testDuplicateAttemptGuard(sql);
    console.log("PASS tentativa única por ligação");

    await testFutureReturnExcludedFromQueue(sql);
    console.log("PASS retorno futuro fora da fila imediata");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
