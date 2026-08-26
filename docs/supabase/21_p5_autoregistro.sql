-- 21_p5_autoregistro.sql — P5: alta por el propio dueño, con prueba y revisión
-- (migración: p5_autoregistro).
--
-- El operador deja de ser el único que crea cafeterías: cualquiera puede
-- registrar la suya en /registro y entrar de inmediato con una prueba de 7
-- días. La revisión del operador ocurre DESPUÉS (reviewed_at), porque hacer
-- esperar a alguien que quiere probar el sistema es la forma más segura de
-- perderlo.
--
-- Las tres columnas quedan FUERA del grant por columna de `businesses`: un
-- dueño no puede extenderse su propia prueba ni marcarse como revisado. Eso
-- solo se toca con service role desde /super o el cron. Verificado en ensayo:
-- el update del dueño falla con "permission denied for table businesses",
-- mientras que sigue pudiendo editar nombre, zona horaria y sus textos.
--
--   trial_ends_at   cuándo termina la prueba (null = sin vencimiento; así
--                   quedan las que crea el operador a mano)
--   reviewed_at     cuándo la revisó el operador (null = sin revisar)
--   signup_source   'operator' (alta manual) | 'self' (auto-registro)

alter table public.businesses
  add column trial_ends_at timestamptz,
  add column reviewed_at timestamptz,
  add column signup_source text not null default 'operator'
    check (signup_source in ('operator', 'self'));

create index if not exists businesses_signup_idx on public.businesses (signup_source, created_at desc);
