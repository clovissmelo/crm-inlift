-- Prévia de impacto da migração 039 (NÃO altera dados — só SELECT).
-- Rodar em staging/produção antes de aplicar 039.

-- Pares que entrarão em client_product_prospeccao
SELECT COUNT(*) AS new_cpp_rows
FROM client_products cp
WHERE NOT EXISTS (
  SELECT 1 FROM client_product_prospeccao cpp
  WHERE cpp.client_id = cp.client_id AND cpp.product_id = cp.product_id
);

-- Clientes oficiais após backfill (simulação)
SELECT COUNT(DISTINCT o.client_id) AS would_be_official
FROM opportunities o WHERE o.outcome = 'won';

-- Telefones com contadores legados (no_answer + wrong_number > 0) — não serão reclassificados automaticamente
SELECT COUNT(*) AS phones_with_legacy_counters
FROM client_phone_dial_state
WHERE cycle_no_answer_count > 0 OR cycle_wrong_number_count > 0;
