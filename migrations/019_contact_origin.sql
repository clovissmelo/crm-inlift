-- Origem do contato (Google Places, Receita Federal, Manual, etc.)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS origin TEXT;

COMMENT ON COLUMN contacts.origin IS 'Fonte do cadastro do contato (ex.: Manual, Google Places, Receita Federal)';
