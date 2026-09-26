ALTER TABLE message_scripts DROP CONSTRAINT IF EXISTS message_scripts_script_type_check;

ALTER TABLE message_scripts
  ADD CONSTRAINT message_scripts_script_type_check
  CHECK (script_type IN ('call', 'whatsapp', 'email'));
