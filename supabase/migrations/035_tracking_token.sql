-- Tracking Token Hash — acesso público limitado do professor a um chamado.
--
-- Padrão de segurança:
--   - O professor NÃO recebe conta autenticada.
--   - Cada chamado gera um token criptograficamente aleatório (secrets.token_urlsafe).
--   - Somente o hash SHA-256 do token é armazenado no banco (nunca o token cru).
--   - O endpoint Flask é a ÚNICA porta pública. RLS permanece fechado.

-- Coluna para o hash do tracking token (UNIQUE para evitar colisões e acelerar lookup).
ALTER TABLE public.chamados_tickets
  ADD COLUMN IF NOT EXISTS tracking_token_hash TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_chamados_tracking_token_hash
  ON public.chamados_tickets(tracking_token_hash);

-- NOTA DE SEGURANÇA:
-- NENHUMA policy RLS pública é criada aqui. O acesso público ao chamado passa
-- exclusivamente pelo endpoint Flask (que usa service_role e valida o hash do
-- token). O RLS de chamados_tickets permanece fechado para anon/authenticated.
