-- Discador SIP embutido (libwebphone): senha por BDR + domínio da conta

ALTER TABLE users ADD COLUMN IF NOT EXISTS api4com_sip_password TEXT;

INSERT INTO system_settings (key, label, category, value, is_secret) VALUES
  ('api4com_sip_domain', 'Domínio SIP API4COM (ex.: empresa.api4com.com)', 'api4com', NULL, false)
ON CONFLICT (key) DO NOTHING;
