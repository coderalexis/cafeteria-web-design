-- 52_p40_errores_2_dias.sql — P40: los errores reportados viven 2 días, no 30
-- (migración: p40_errores_2_dias).
--
-- El panel de /super saludaba cada mañana con los mismos errores de la semana
-- aunque ya estuvieran atendidos (los «reading 'call'» de P40, corregidos el
-- 2026-09-06). El usuario pidió que un error ya visto no se quede: lo que
-- sigue pasando se reporta solo otra vez, y lo que ya no pasa no tiene por qué
-- seguir a la vista. La app enseña los últimos 2 días (`ERRORES_DIAS`) y la
-- base guarda lo mismo.
--
-- Se PARCHEA la definición viva de `report_error` (migración 38) con un solo
-- reemplazo anclado, como en la 40 y la 51: el plazo de la limpieza pasa de
-- 30 a 2 días. El anti-tormenta (1 por minuto por ruta y mensaje, 300 por
-- hora) no cambia.

do $patch$
declare
  v_def text;
  v_antes text := $a$interval '30 days'$a$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'report_error';
  if v_def is null then
    raise exception 'No encontré report_error.';
  end if;
  if position(v_antes in v_def) = 0 then
    raise exception 'Parche: no encontré el plazo de 30 días en report_error.';
  end if;
  v_def := replace(v_def, v_antes, $a$interval '2 days'$a$);
  execute v_def;
end;
$patch$;
