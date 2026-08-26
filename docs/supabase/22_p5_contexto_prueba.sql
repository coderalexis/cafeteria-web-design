-- 22_p5_contexto_prueba.sql — P5: my_context() expone trial_ends_at
-- (migración: p5_contexto_prueba).
--
-- La migración 21 agregó `businesses.trial_ends_at`, pero el contexto que la app
-- lee en cada petición (`my_context`) no lo devolvía, así que el banner de fin de
-- prueba no tenía de dónde sacar la fecha.
--
-- Se parcha la definición viva en lugar de reescribir la función completa: el
-- cuerpo de `my_context` ya venía de la migración 13 y volver a pegarlo entero
-- solo abre la puerta a que las dos copias se separen. `pg_get_functiondef` +
-- `replace` garantiza que lo único que cambia es lo que se pretende cambiar,
-- verificando que el ancla aparezca EXACTAMENTE una vez.
--
-- Es de solo lectura: el dueño ve cuándo termina su prueba pero NO puede
-- moverla, porque `trial_ends_at` nunca entró al `grant update (...)` por
-- columna de la migración 09 (verificado: "permission denied for table
-- businesses" al intentarlo con la sesión del dueño).

do $mig$
declare
  v_src text;
  v_anchor text := '''settings'', b.settings)';
  v_hits int;
begin
  v_src := pg_get_functiondef('public.my_context()'::regprocedure);
  if position('trial_ends_at' in v_src) > 0 then
    raise notice 'my_context ya expone trial_ends_at; no se hace nada.';
    return;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'El ancla aparece % veces (se esperaba 1). Revisar my_context a mano.', v_hits;
  end if;
  execute replace(v_src, v_anchor, '''settings'', b.settings, ''trial_ends_at'', b.trial_ends_at)');
end
$mig$;
