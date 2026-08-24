-- Corrigir constraint de tipo nas movimentacoes
-- Execute no SQL Editor

-- Remover constraint antiga
ALTER TABLE stock.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;

-- Recriar com todos os tipos que o frontend usa
ALTER TABLE stock.stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('entrada', 'saida', 'mudanca_sala', 'conserto', 'descarte', 'substituicao', 'emprestimo', 'devolucao'));
