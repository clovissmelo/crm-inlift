-- Lead de teste na fila "Leads para prospecção"
-- Requer: usuário clovis@inlift.com.br e tabelas 001 + 002 (follow_ups, approaches renomeada)

INSERT INTO products (name, description, status, uses_proposal, created_at, updated_at)
SELECT 'Produto Teste CRM', 'Lead de demonstração', 'active', false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Produto Teste CRM');

INSERT INTO clients (
  cnpj,
  legal_name,
  trade_name,
  segment,
  city,
  uf,
  bdr_user_id,
  created_at,
  updated_at
)
SELECT
  '99.999.999/0001-99',
  'Empresa Teste Prospecção LTDA',
  'Lead Teste Inlift',
  'Tecnologia',
  'São Paulo',
  'SP',
  u.id,
  now(),
  now()
FROM users u
WHERE lower(u.email) = lower('clovis@inlift.com.br')
  AND NOT EXISTS (SELECT 1 FROM clients WHERE cnpj = '99.999.999/0001-99');

INSERT INTO client_products (client_id, product_id)
SELECT c.id, p.id
FROM clients c
CROSS JOIN products p
WHERE c.cnpj = '99.999.999/0001-99'
  AND p.name = 'Produto Teste CRM'
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
  'Maria Contato Teste',
  'Gerente Comercial',
  '11999998888',
  '11999998888',
  'maria.teste@lead-inlift.com.br',
  'confirmed',
  now(),
  now()
FROM clients c
WHERE c.cnpj = '99.999.999/0001-99'
  AND NOT EXISTS (
    SELECT 1 FROM contacts ct
    WHERE ct.client_id = c.id AND lower(ct.email) = lower('maria.teste@lead-inlift.com.br')
  );

-- Opcional: aparece como "Retorno para hoje" na fila
INSERT INTO follow_ups (
  client_id,
  contact_id,
  product_id,
  kind,
  assigned_user_id,
  created_by_user_id,
  scheduled_at,
  status,
  notes,
  created_at,
  updated_at
)
SELECT
  c.id,
  ct.id,
  p.id,
  'return',
  u.id,
  u.id,
  date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + interval '15 hours',
  'pending',
  'Retorno de teste — prospecção',
  now(),
  now()
FROM clients c
JOIN contacts ct ON ct.client_id = c.id AND lower(ct.email) = lower('maria.teste@lead-inlift.com.br')
JOIN products p ON p.name = 'Produto Teste CRM'
JOIN users u ON lower(u.email) = lower('clovis@inlift.com.br')
WHERE c.cnpj = '99.999.999/0001-99'
  AND NOT EXISTS (
    SELECT 1 FROM follow_ups fu
    WHERE fu.client_id = c.id AND fu.status = 'pending' AND fu.notes = 'Retorno de teste — prospecção'
  );

SELECT
  c.id,
  c.trade_name,
  c.city,
  c.uf,
  u.name AS bdr,
  p.name AS produto,
  ct.name AS contato,
  ct.phone
FROM clients c
LEFT JOIN users u ON u.id = c.bdr_user_id
LEFT JOIN client_products cp ON cp.client_id = c.id
LEFT JOIN products p ON p.id = cp.product_id
LEFT JOIN contacts ct ON ct.client_id = c.id
WHERE c.cnpj = '99.999.999/0001-99';
