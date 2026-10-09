ALTER TABLE warm_screen_executions DROP CONSTRAINT IF EXISTS warm_screen_executions_dial_mode_check;
ALTER TABLE warm_screen_executions DROP COLUMN IF EXISTS dial_mode;
