-- ============================================================
-- 11 — Panel de la plataforma (M3): resumen de negocios para /super.
-- Solo service_role (la app la llama tras requireSuperAdmin()).
-- ============================================================

create or replace function public.platform_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'slug', b.slug,
    'status', b.status,
    'plan', b.plan,
    'is_template', b.is_template,
    'timezone', b.timezone,
    'created_at', b.created_at,
    'active_members', (select count(*) from public.business_members m where m.business_id = b.id and m.is_active),
    'owners', (
      select coalesce(jsonb_agg(coalesce(nullif(p.full_name, ''), m.username, '?') order by m.created_at), '[]'::jsonb)
      from public.business_members m
      left join public.profiles p on p.id = m.user_id
      where m.business_id = b.id and m.role = 'owner' and m.is_active),
    'has_menu', exists (select 1 from public.menu_categories c where c.business_id = b.id),
    'tickets_30d', (
      select count(*) from public.tickets t
      where t.business_id = b.id and t.status = 'completado' and t.created_at >= now() - interval '30 days'),
    'revenue_30d', (
      select coalesce(sum(t.total), 0) from public.tickets t
      where t.business_id = b.id and t.status = 'completado' and t.created_at >= now() - interval '30 days'),
    'last_sale_at', (select max(t.created_at) from public.tickets t where t.business_id = b.id)
  ) order by b.is_template, b.created_at), '[]'::jsonb)
  from public.businesses b
$$;

revoke execute on function public.platform_overview() from public, anon, authenticated;
grant execute on function public.platform_overview() to service_role;
