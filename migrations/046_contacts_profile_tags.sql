-- Tags de perfil em contatos (ex.: PERFIL DECISOR), usadas pelo roteiro de ligação.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS profile_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN contacts.profile_tags IS 'Tags de perfil exibidas na ficha (JSON array de strings).';
