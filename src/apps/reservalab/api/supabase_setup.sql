-- Criar tabela de reservas de tablets
CREATE TABLE IF NOT EXISTS tablet_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sala text NOT NULL,
  quantidade_tablets integer NOT NULL,
  professor text NOT NULL,
  horario_inicio timestamptz NOT NULL,
  horario_fim timestamptz NOT NULL,
  finalidade text DEFAULT '',
  reservado_por text DEFAULT '',
  status text DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'cancelada')),
  created_at timestamptz DEFAULT now()
);

-- RLS liberado (sem auth)
ALTER TABLE tablet_reservations ENABLE ROW LEVEL SECURITY;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tablet_reservations' AND policyname = 'Ler reservas') THEN
    CREATE POLICY "Ler reservas" ON tablet_reservations FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tablet_reservations' AND policyname = 'Inserir reservas') THEN
    CREATE POLICY "Inserir reservas" ON tablet_reservations FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tablet_reservations' AND policyname = 'Atualizar reservas') THEN
    CREATE POLICY "Atualizar reservas" ON tablet_reservations FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tablet_reservations' AND policyname = 'Excluir reservas') THEN
    CREATE POLICY "Excluir reservas" ON tablet_reservations FOR DELETE USING (true);
  END IF;
END\$\$;
