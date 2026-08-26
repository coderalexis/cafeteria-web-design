-- 23_p5_super_autoregistro.sql — P5: /super ve las altas por cuenta propia
-- (migración: p5_super_autoregistro).
--
-- Con el auto-registro (migración 21) las cafeterías ya no nacen todas de la
-- mano del operador. El panel necesita distinguirlas y saber en qué punto de la
-- prueba van, así que `platform_overview` devuelve tres campos más:
--   · signup_source — 'operator' (la dio de alta el operador) o 'self'.
--   · trial_ends_at — cuándo termina la prueba gratis (null = sin prueba).
--   · reviewed_at   — cuándo el operador la revisó; null = pendiente de mirar.
--
-- Se recrea entera a propósito: es corta y este archivo es su única fuente.
-- La firma no cambia, así que los grants de la migración 11 se conservan
-- (`create or replace` no los toca), pero se repiten al final por si acaso.

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
    'signup_source', b.signup_source,
    'trial_ends_at', b.trial_ends_at,
    'reviewed_at', b.reviewed_at,
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
