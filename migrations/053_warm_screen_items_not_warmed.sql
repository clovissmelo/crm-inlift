DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'warm_screen_executions'
  ) THEN
    ALTER TABLE warm_screen_executions
      ADD COLUMN IF NOT EXISTS items_not_warmed INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
