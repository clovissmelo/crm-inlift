INSERT INTO system_settings (key, label, category, value, is_secret) VALUES
  ('api4com_token_policy', 'Quem cadastra o token API4COM', 'api4com', 'global', false)
ON CONFLICT (key) DO NOTHING;
