-- 55_p42_logo_contexto.sql — P42: el logo viaja en el contexto (migración: p42_logo_contexto).
--
-- La 54 creó el bucket y las dos columnas. Falta que la app las VEA: el ticket
-- se arma en el navegador (`lib/receipt.ts`) con lo que trae `my_context()`,
-- así que si el logo no viene ahí, la impresora nunca lo verá. El menú público
-- no necesita esto —se sirve por slug y consulta `businesses` directo—, pero el
-- ticket y las pantallas del POS sí.
--
-- Va en su propia migración y no dentro de la 54 porque son dos momentos
-- distintos del despliegue: la 54 se aplicó de una vez (no afecta a nadie), y
-- esta acompaña al código que lee las claves nuevas.
--
-- Se PARCHEA la definición viva con un ancla en vez de reteclear la función:
-- `my_context()` ya se reescribió dos veces (09 y 13) y le siguieron añadidos
-- como `trial_ends_at`; retipearla entera es la forma fácil de borrar uno sin
-- darse cuenta. Si el ancla no está, la migración FALLA (no sigue a ciegas).
do $$
declare
  v_def text;
  v_ancla text := '''settings'', b.settings, ''trial_ends_at'', b.trial_ends_at)';
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'my_context';

  if v_def is null then
    raise exception 'No existe public.my_context: nada que parchear.';
  end if;
  if position('''logo_url''' in v_def) > 0 then
    raise notice 'my_context ya trae el logo; no se toca.';
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'El ancla no está en my_context; revisar antes de seguir.';
  end if;

  v_nuevo := replace(
    v_def,
    v_ancla,
    '''settings'', b.settings, ''trial_ends_at'', b.trial_ends_at,' || chr(10) ||
    '        -- El logo: a color para las pantallas, monocromo para la térmica.' || chr(10) ||
    '        ''logo_url'', b.logo_url, ''logo_ticket_url'', b.logo_ticket_url)'
  );
  execute v_nuevo;
end $$;
