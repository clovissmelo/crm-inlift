-- Trilha de etapas/opções selecionadas no guia de script durante a ligação

ALTER TABLE api4com_calls ADD COLUMN IF NOT EXISTS script_flow_log JSONB NOT NULL DEFAULT '[]'::jsonb;
