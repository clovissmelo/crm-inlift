-- Rótulo alinhado ao botão "Agendar contato" na fila de prospecção.
UPDATE prospeccao_priority_types
SET name = 'Agendado', updated_at = NOW()
WHERE slug = 'retorno';
