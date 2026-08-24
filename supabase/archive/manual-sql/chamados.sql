-- ============================================
-- Chamados — tabela usada pelo form público (QR)
-- O app também tenta criar via RPC pg_sql no primeiro uso.
-- Execute este script no SQL Editor se a RPC não estiver disponível.
-- ============================================

CREATE TABLE IF NOT EXISTS public.chamados_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id" UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    "roomId" TEXT NOT NULL DEFAULT '',
    "roomName" TEXT NOT NULL DEFAULT '',
    "assetId" TEXT DEFAULT '',
    "assetSource" TEXT DEFAULT '',
    "assetName" TEXT DEFAULT '',
    "assetPatrimony" TEXT DEFAULT '',
    "problemCategory" TEXT NOT NULL DEFAULT '',
    "problemArea" TEXT NOT NULL DEFAULT '',
    "problemDescription" TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'aberto',
    "reportedBy" TEXT NOT NULL DEFAULT '',
    "reportedByEmail" TEXT DEFAULT '',
    "assignedTo" TEXT DEFAULT '',
    "ticketNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "resolvedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chamados_workspace ON public.chamados_tickets("workspace_id");
CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados_tickets(status);

-- Sem policies: somente o service role (API Flask) acessa a tabela.
ALTER TABLE public.chamados_tickets ENABLE ROW LEVEL SECURITY;
