-- 56_p42_logo_menu_publico.sql — P42: el logo en el menú público (migración: p42_logo_menu_publico).
--
-- El menú del QR no pasa por `my_context()`: quien escanea no tiene sesión y
-- todo sale de `public_menu(slug)`. Así que el logo tiene que salir de ahí
-- también, o la carta seguiría encabezada por el icono genérico de una taza.
--
-- Solo va el logo A COLOR. El monocromo es para la térmica y en una pantalla
-- se ve pobre; y de paso, publicar en una página abierta a internet solo lo
-- que hace falta.
--
-- Va aparte de la 55 porque son dos funciones distintas y una puede fallar sin
-- la otra: si un día el ancla de `public_menu` cambia, prefiero que reviente
-- esta migración y no la que le da el logo al ticket.
--
-- Patrón de siempre: parchear la definición viva con anclas exactas y fallar
-- si no están, en vez de reteclear una función de 90 líneas que ya se editó
-- varias veces (menu_note en la 25, extras, notas de categoría…).
do $$
declare
  v_def text;
  v_ancla_select text := '  select id, name, slug, address, phone, receipt_header, settings, status, is_template';
  v_ancla_json text := '      ''menu_note'', nullif(v_biz.settings->>''menu_note'', '''')';
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'public_menu';

  if v_def is null then
    raise exception 'No existe public.public_menu: nada que parchear.';
  end if;
  if position('logo_url' in v_def) > 0 then
    raise notice 'public_menu ya trae el logo; no se toca.';
    return;
  end if;
  if position(v_ancla_select in v_def) = 0 then
    raise exception 'El ancla del select no está en public_menu; revisar antes de seguir.';
  end if;
  if position(v_ancla_json in v_def) = 0 then
    raise exception 'El ancla del jsonb no está en public_menu; revisar antes de seguir.';
  end if;

  v_nuevo := replace(
    replace(v_def, v_ancla_select, v_ancla_select || ', logo_url'),
    v_ancla_json,
    v_ancla_json || ',' || chr(10) ||
    '      -- Solo el de color: el monocromo es para la térmica.' || chr(10) ||
    '      ''logo_url'', v_biz.logo_url'
  );
  execute v_nuevo;
end $$;
