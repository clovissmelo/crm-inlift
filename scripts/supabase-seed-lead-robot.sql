-- Simula um lead NOVO descoberto pelo motor (Admin → Novos leads / Google Places).
-- Aparece em "Leads para prospecção" na parte de leads sem abordagem (após retornos).
-- Requer: usuário clovis@inlift.com.br, migrações 001–008 (+ 009 se produtos exigirem company_id).

WITH admin_user AS (
  SELECT id FROM users WHERE lower(email) = lower('clovis@inlift.com.br') LIMIT 1
),
discovery_run AS (
  INSERT INTO lead_discovery_runs (
    requested_by_user_id,
    uf,
    cities,
    segment,
    quantity_requested,
    quantity_inserted,
    quantity_skipped_existing,
    status,
    error_message,
    created_at,
    completed_at
  )
  SELECT
    u.id,
    'SP',
    'Campinas',
    'Postos de combustível',
    1,
    1,
    0,
    'completed',
    'Simulação manual — lead inserido via SQL (motor Places)',
    now(),
    now()
  FROM admin_user u
  WHERE NOT EXISTS (
    SELECT 1 FROM clients WHERE cnpj = '12345678000190'
  )
  RETURNING id
),
new_client AS (
  INSERT INTO clients (
    cnpj,
    legal_name,
    trade_name,
    segment,
    city,
    uf,
    address,
    website,
    instagram,
    notes,
    bdr_user_id,
    lead_qualification,
    created_at,
    updated_at
  )
  SELECT
    '12345678000190',
    'Auto Posto Horizonte Campinas LTDA',
    'Posto Horizonte — Campinas',
    'Postos de combustível',
    'Campinas',
    'SP',
    'Av. das Amoreiras, 1200 — Jardim Proença',
    'https://postohorizonte-exemplo.com.br',
    '@postohorizonte_cps',
    'Origem: motor de leads (google_places), run simulado. external_key: places:ChIJ_robot_seed_horizonte',
    u.id,
    'cold',
    now(),
    now()
  FROM admin_user u
  WHERE NOT EXISTS (SELECT 1 FROM clients WHERE cnpj = '12345678000190')
  RETURNING id
)
INSERT INTO client_products (client_id, product_id)
SELECT c.id, p.id
FROM new_client c
CROSS JOIN LATERAL (
  SELECT id FROM products WHERE status = 'active' ORDER BY id LIMIT 1
) p
ON CONFLICT DO NOTHING;

INSERT INTO contacts (
  client_id,
  name,
  job_title,
  phone,
  whatsapp,
  email,
  verification_status,
  created_at,
  updated_at
)
SELECT
  c.id,
  'Recepção',
  'Atendimento',
  '1933334444',
  '19987654321',
  'contato@postohorizonte-exemplo.com.br',
  'unverified',
  now(),
  now()
FROM clients c
WHERE c.cnpj = '12345678000190'
  AND NOT EXISTS (
    SELECT 1 FROM contacts ct
    WHERE ct.client_id = c.id AND lower(ct.email) = lower('contato@postohorizonte-exemplo.com.br')
  );

-- Confirmação
SELECT
  c.id,
  c.trade_name,
  c.segment,
  c.city,
  c.uf,
  c.notes,
  u.name AS bdr,
  p.name AS produto,
  ct.phone,
  ct.whatsapp,
  ldr.id AS discovery_run_id,
  ldr.status AS discovery_status
FROM clients c
LEFT JOIN users u ON u.id = c.bdr_user_id
LEFT JOIN client_products cp ON cp.client_id = c.id
LEFT JOIN products p ON p.id = cp.product_id
LEFT JOIN contacts ct ON ct.client_id = c.id
LEFT JOIN lead_discovery_runs ldr ON ldr.error_message LIKE '%Simulação manual%'
  AND ldr.quantity_inserted = 1
  AND ldr.segment = 'Postos de combustível'
WHERE c.cnpj = '12345678000190';
