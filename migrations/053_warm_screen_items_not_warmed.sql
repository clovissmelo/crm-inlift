ALTER TABLE warm_screen_executions
  ADD COLUMN IF NOT EXISTS items_not_warmed INTEGER NOT NULL DEFAULT 0;
