-- 51_p39_fuera_de_menu.sql — P39: vender algo que no está en el menú, con el
-- precio decidido en caja (migración: p39_fuera_de_menu).
--
-- El caso del gym: «quiero esta fruta picada pero sin yogurt», y Diana decide
-- el precio al vuelo. Hasta hoy eso no cabía en el sistema: cada renglón de
-- un ticket tenía que ser una variante del menú, y el servidor ponía el
-- precio. La alternativa —dar de alta un producto en el panel para cada
-- ocurrencia— es justo lo que nadie hace con fila.
--
-- El modelo: un renglón «fuera de menú» lleva nombre y precio escritos en
-- caja, sin producto ni variante detrás (`product_id`/`variant_id` nulos,
-- que ya eran opcionales) y marcado con `is_custom`, para que en los
-- reportes se distinga de lo que sí está en el menú.
--
-- La regla de dinero que se relaja, y hasta dónde: el precio de esos
-- renglones lo manda la caja —no hay de dónde más sacarlo—, pero acotado
-- ($0.01 a $9,999.99), sin extras, con nombre, solo con el módulo encendido
-- (`settings.custom_items`, encendido por omisión) y siempre visible como
-- «fuera de menú». Lo del menú sigue exactamente igual: el servidor pone el
-- precio y valida todo.

-- ── 1) La marca en el renglón ──────────────────────────────────────
alter table public.ticket_items
  add column is_custom boolean not null default false;

comment on column public.ticket_items.is_custom is
  'Renglón fuera de menú: nombre y precio decididos en caja; sin producto ni costo detrás.';

-- ── 2) ticket_lines v2: menú + fuera de menú ───────────────────────
-- Cambia el tipo de retorno (gana `is_custom`), así que se tira y se vuelve a
-- crear. `promo_best` y `create_ticket` la llaman por nombre: no se rompen.
-- Un elemento es del menú si trae `variant_id`, y fuera de menú si trae
-- `custom: {name, price}` y NO trae `variant_id`.
drop function public.ticket_lines(uuid, jsonb);

create function public.ticket_lines(p_biz uuid, p_items jsonb)
returns table (
  idx bigint,
  variant_id uuid,
  product_id uuid,
  category_id uuid,
  product_name text,
  variant_name text,
  size_label text,
  quantity int,
  unit_price numeric,
  line_total numeric,
  unit_cost numeric,
  notes text,
  modifier_ids jsonb,
  is_custom boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select e.idx,
         v.id,
         p.id,
         p.category_id,
         p.name,
         v.name,
         v.size_label,
         (e.elem->>'quantity')::int,
         round(v.price + coalesce(md.delta, 0), 2),
         round(round(v.price + coalesce(md.delta, 0), 2) * (e.elem->>'quantity')::int, 2),
         v.cost,
         nullif(trim(coalesce(e.elem->>'notes', '')), ''),
         case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end,
         false
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (e.elem->>'variant_id')::uuid and v.business_id = p_biz
  join public.menu_products p on p.id = v.product_id and p.business_id = p_biz
  left join lateral (
    select sum(m.price_delta) as delta
    from jsonb_array_elements_text(
      case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = p_biz
  ) md on true
  where e.elem ? 'variant_id'
  union all
  select e.idx,
         null::uuid,
         null::uuid,
         null::uuid,
         left(regexp_replace(trim(e.elem->'custom'->>'name'), '\s+', ' ', 'g'), 80),
         'Único',
         null::text,
         (e.elem->>'quantity')::int,
         round((e.elem->'custom'->>'price')::numeric, 2),
         round(round((e.elem->'custom'->>'price')::numeric, 2) * (e.elem->>'quantity')::int, 2),
         0::numeric,
         nullif(trim(coalesce(e.elem->>'notes', '')), ''),
         '[]'::jsonb,
         true
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  where jsonb_typeof(e.elem->'custom') = 'object' and not (e.elem ? 'variant_id')
  order by 1
$fn$;

revoke all on function public.ticket_lines(uuid, jsonb) from public, anon, authenticated;

-- ── 3) create_ticket v16: acepta renglones fuera de menú ───────────
-- Se PARCHEA la definición viva (v15, migración 50) con tres reemplazos
-- comprobados, como en la 36 y la 40: retipear la función entera es la forma
-- más fácil de revertir un arreglo en silencio.
--   (a) una variable más;
--   (b) la cuenta de renglones válidos suma los fuera de menú, validados
--       aquí mismo (módulo, nombre, precio acotado, sin extras);
--   (c) el renglón se graba con su marca.
do $patch$
declare
  v_def text;
  v_antes text;
  v_despues text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_ticket';
  if v_def is null then
    raise exception 'No encontré create_ticket.';
  end if;

  -- (a) variable
  v_antes := E'  v_credit public.credit_customers;\nbegin\n';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (a): no encontré el declare.';
  end if;
  v_def := replace(v_def, v_antes, E'  v_credit public.credit_customers;\n  v_custom_count int := 0;\nbegin\n');

  -- (b) renglones válidos
  v_antes :=
    E'  select count(*) into v_valid_count\n'
    '  from jsonb_array_elements(p_items) as e(elem)\n'
    '  join public.menu_variants v\n'
    '    on v.id = (elem->>''variant_id'')::uuid and v.is_active and v.business_id = v_biz\n'
    '  join public.menu_products p\n'
    '    on p.id = v.product_id and p.is_active and p.business_id = v_biz;\n'
    '\n'
    '  if v_valid_count <> v_input_count then\n'
    '    raise exception ''Uno o más artículos no existen o están inactivos.'';\n'
    '  end if;\n';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (b): no encontré la cuenta de renglones válidos.';
  end if;
  v_despues :=
    E'  select count(*) into v_valid_count\n'
    '  from jsonb_array_elements(p_items) as e(elem)\n'
    '  join public.menu_variants v\n'
    '    on v.id = (elem->>''variant_id'')::uuid and v.is_active and v.business_id = v_biz\n'
    '  join public.menu_products p\n'
    '    on p.id = v.product_id and p.is_active and p.business_id = v_biz\n'
    '  where elem ? ''variant_id'';\n'
    '\n'
    '  -- Fuera de menú (migración 51): renglones con nombre y precio decididos en\n'
    '  -- caja. El precio lo manda la caja, pero acotado, con nombre, sin extras y\n'
    '  -- solo con el módulo encendido.\n'
    '  select count(*) into v_custom_count\n'
    '  from jsonb_array_elements(p_items) as e(elem)\n'
    '  where jsonb_typeof(elem->''custom'') = ''object'' and not (elem ? ''variant_id'');\n'
    '  if v_custom_count > 0 then\n'
    '    if exists (select 1 from public.businesses b where b.id = v_biz and coalesce(b.settings->>''custom_items'', ''true'') = ''false'') then\n'
    '      raise exception ''Vender fuera de menú está apagado. Se enciende en Datos y ajustes → Módulos.'';\n'
    '    end if;\n'
    '    if exists (\n'
    '      select 1 from jsonb_array_elements(p_items) as e(elem)\n'
    '      where jsonb_typeof(elem->''custom'') = ''object'' and not (elem ? ''variant_id'')\n'
    '        and (length(trim(coalesce(elem->''custom''->>''name'', ''''))) not between 1 and 80\n'
    '             or coalesce(elem->''custom''->>''price'', '''') !~ ''^[0-9]+(\\.[0-9]+)?$''\n'
    '             or (elem->''custom''->>''price'')::numeric < 0.01\n'
    '             or (elem->''custom''->>''price'')::numeric > 9999.99\n'
    '             or (jsonb_typeof(elem->''modifiers'') = ''array'' and jsonb_array_length(elem->''modifiers'') > 0))\n'
    '    ) then\n'
    '      raise exception ''Un artículo fuera de menú necesita nombre (hasta 80 letras) y precio entre $0.01 y $9,999.99, sin extras.'';\n'
    '    end if;\n'
    '  end if;\n'
    '\n'
    '  if v_valid_count + v_custom_count <> v_input_count then\n'
    '    raise exception ''Uno o más artículos no existen o están inactivos.'';\n'
    '  end if;\n';
  v_def := replace(v_def, v_antes, v_despues);

  -- (c) la marca en el renglón
  v_antes :=
    E'    insert into public.ticket_items\n'
    '      (business_id, ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,\n'
    '       product_name, variant_name, size_label, unit_cost)\n'
    '    values (\n'
    '      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, r.line_total,\n'
    '      r.notes,\n'
    '      r.product_name, r.variant_name, r.size_label, r.unit_cost\n'
    '    )\n';
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche (c): no encontré el insert de renglones.';
  end if;
  v_despues :=
    E'    insert into public.ticket_items\n'
    '      (business_id, ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,\n'
    '       product_name, variant_name, size_label, unit_cost, is_custom)\n'
    '    values (\n'
    '      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, r.line_total,\n'
    '      r.notes,\n'
    '      r.product_name, r.variant_name, r.size_label, r.unit_cost, r.is_custom\n'
    '    )\n';
  v_def := replace(v_def, v_antes, v_despues);

  execute v_def;
end;
$patch$;

-- ── 4) Lo que se ha vendido fuera de menú, para repetirlo en un toque ──
-- Agrupado por nombre sin mayúsculas, con el ÚLTIMO precio que se le puso.
create or replace function public.custom_items_recent(p_days int default 60)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'price', x.price, 'n', x.n, 'last_at', x.last_at)
                            order by x.n desc, x.last_at desc), '[]'::jsonb)
  from (
    select (array_agg(ti.product_name order by t.created_at desc))[1] as name,
           (array_agg(ti.unit_price order by t.created_at desc))[1] as price,
           count(*) as n,
           max(t.created_at) as last_at
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id
    where t.business_id = (select public.current_business_id())
      and t.status = 'completado'
      and ti.is_custom
      and t.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 60), 365)))
    group by lower(ti.product_name)
    order by count(*) desc, max(t.created_at) desc
    limit 12
  ) x
$fn$;

revoke execute on function public.custom_items_recent(int) from public, anon;
grant execute on function public.custom_items_recent(int) to authenticated;
