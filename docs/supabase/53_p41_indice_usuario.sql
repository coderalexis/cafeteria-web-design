-- 53_p41_indice_usuario.sql — P41: buscar una cuenta por USUARIO, sin el café
-- (migración: p41_indice_usuario).
--
-- Hasta ahora, entrar con una cuenta de café pedía usuario + café: el índice
-- único `(business_id, username)` resuelve esa búsqueda porque llega el café
-- primero. Con el campo del café oculto, el login busca al revés —solo por
-- `username`, en todos los negocios— y ese índice NO sirve: `business_id` va
-- al frente, así que Postgres tendría que recorrer la tabla entera.
--
-- Con seis filas da igual. Con mil cuentas y una cafetería abriendo a las
-- siete de la mañana, no: el login es la ruta más cara del sistema —ya nos
-- costó un 504 por latencia acumulada (ver `vercel.json`, región pdx1)— y no
-- es donde conviene añadir un recorrido secuencial.
--
-- Solo se indexan las que pueden entrar: las cuentas de café (`username not
-- null`) y activas. Las membresías por correo no tienen usuario y las
-- desactivadas no deben resolver a nadie, así que el índice parcial es más
-- pequeño y más honesto sobre lo que se consulta.

create index if not exists idx_business_members_username
  on public.business_members (username)
  where username is not null and is_active;

comment on index public.idx_business_members_username is
  'Login por usuario sin café: se busca en todos los negocios. El único (business_id, username) no sirve porque el negocio va al frente.';
