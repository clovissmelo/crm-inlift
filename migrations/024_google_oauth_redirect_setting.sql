INSERT INTO system_settings (key, label, category, value, is_secret) VALUES
  (
    'google_oauth_redirect_uri',
    'URI de redirect OAuth (opcional — vazio usa a URL do site + /api/integrations/google/callback)',
    'google_calendar',
    NULL,
    false
  )
ON CONFLICT (key) DO NOTHING;
