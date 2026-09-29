-- Produto → segmento e fluxo padrão para Novos leads

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS lead_gen_segment_slug TEXT REFERENCES lead_generation_segments(slug) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_gen_flow_id BIGINT REFERENCES lead_generation_flows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_lead_gen_flow ON products (lead_gen_flow_id);

UPDATE products p SET
  lead_gen_segment_slug = COALESCE(p.lead_gen_segment_slug, 'all'),
  lead_gen_flow_id = COALESCE(p.lead_gen_flow_id, f.id)
FROM lead_generation_flows f
WHERE f.slug = 'fluxo_posto' AND p.name ILIKE 'PostoCred';
