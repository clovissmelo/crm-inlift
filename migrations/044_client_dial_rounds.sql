-- Rodadas de ligação na prospecção (todos os números ativos discados = +1 rodada).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS prospeccao_completed_dial_rounds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS client_dial_round_progress (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_phone_id INTEGER NOT NULL REFERENCES client_phones(id) ON DELETE CASCADE,
  touched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, client_phone_id)
);

CREATE INDEX IF NOT EXISTS idx_client_dial_round_progress_client ON client_dial_round_progress (client_id);

COMMENT ON COLUMN clients.prospeccao_completed_dial_rounds IS 'Rodadas concluídas: cada rodada exige tentativa em todos os telefones ainda não esgotados.';
COMMENT ON TABLE client_dial_round_progress IS 'Telefones já discados na rodada atual (incompleta).';
