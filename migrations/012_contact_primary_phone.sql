-- Contato marcado como telefone principal do cliente (Ligar, prospecção, atalhos)

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_primary_phone BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_one_primary_phone_per_client
  ON contacts (client_id)
  WHERE is_primary_phone = true;
