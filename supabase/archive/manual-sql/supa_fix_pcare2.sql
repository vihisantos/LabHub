-- Corrigir constraint de tipo e colunas na pcare.maintenance
-- Execute no SQL Editor

-- Remover constraint antiga
ALTER TABLE pcare.maintenance DROP CONSTRAINT IF EXISTS maintenance_type_check;

-- Recriar com os tipos que o frontend usa
ALTER TABLE pcare.maintenance ADD CONSTRAINT maintenance_type_check
  CHECK (type IN ('cleaning', 'restoration', 'both'));
