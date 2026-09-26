-- Token API4COM opcional por BDR (alternativa ao token global em system_settings)

ALTER TABLE users ADD COLUMN IF NOT EXISTS api4com_api_token TEXT;
