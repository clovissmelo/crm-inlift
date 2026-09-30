-- Marca telefone do contato como verificado ao registrar abordagem com este resultado

ALTER TABLE approach_result_types
  ADD COLUMN IF NOT EXISTS mark_phone_verified BOOLEAN NOT NULL DEFAULT false;

UPDATE approach_result_types
SET mark_phone_verified = true
WHERE slug IN ('falou_responsavel', 'falou_outra_pessoa', 'demonstrou_interesse', 'reuniao_agendada');
