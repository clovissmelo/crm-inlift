-- Segmentos do motor de leads (rótulos editáveis no Admin)

CREATE TABLE IF NOT EXISTS lead_generation_segments (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  filter_kind TEXT NOT NULL
    CHECK (filter_kind IN ('all', 'branded', 'white_flag', 'distributor', 'trr')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO lead_generation_segments (slug, label, filter_kind, sort_order) VALUES
  ('all', 'Todos os Postos de Combustível', 'all', 10),
  ('branded', 'Postos de Combustível Bandeirado', 'branded', 20),
  ('white_flag', 'Postos de Combustível Bandeira Branca', 'white_flag', 30),
  ('distributor', 'Distribuidoras de Combustível', 'distributor', 40),
  ('trr', 'TRR — Transportador Revendedor Retalhista', 'trr', 50)
ON CONFLICT (slug) DO NOTHING;
