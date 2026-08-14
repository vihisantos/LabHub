-- ─────────────────────────────────────────────────────────────
-- FIX: aprovação/edição de usuários pelo admin absoluto
-- ─────────────────────────────────────────────────────────────
-- Problema: a tabela `profiles` tinha RLS permitindo SELECT de todos,
-- mas o UPDATE/DELETE só do próprio perfil (auth.uid() = id).
-- Resultado: aprovar usuário, mudar cargo, acento, workspaces etc.
-- retornava "sucesso" no app sem alterar nada no banco (update
-- silenciosamente afeta 0 linhas) — as contas voltavam a aparecer
-- como pendentes a cada visita.
--
-- Como aplicar: Supabase Dashboard → SQL Editor → cole e Execute.
--
-- 1) Função que detecta se quem está logado é admin absoluto:
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- 2) Admin absoluto pode EDITAR qualquer perfil:
drop policy if exists "admin_abs_edit_profiles" on public.profiles;
create policy "admin_abs_edit_profiles"
on public.profiles
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- 3) Admin absoluto pode DELETAR (rejeitar) qualquer perfil:
drop policy if exists "admin_abs_delete_profiles" on public.profiles;
create policy "admin_abs_delete_profiles"
on public.profiles
for delete
to authenticated
using (public.is_super_admin());
