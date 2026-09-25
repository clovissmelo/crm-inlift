-- Qualificação do lead: frio (azul), morno (amarelo), quente (vermelho)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_qualification TEXT NOT NULL DEFAULT 'cold';

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_lead_qualification_check;
ALTER TABLE clients ADD CONSTRAINT clients_lead_qualification_check
  CHECK (lead_qualification IN ('cold', 'warm', 'hot'));

UPDATE clients SET lead_qualification = 'cold' WHERE lead_qualification IS NULL;
