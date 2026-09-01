-- despues_de_01_schema.sql — el operador de la plataforma.
--
-- La migración 09 hace su relleno con un usuario concreto: crea «El Cafecito»
-- y la plantilla con `created_by` = el operador, y lo marca como
-- administrador de la plataforma. En producción ese usuario existía desde el
-- primer día; en una base virgen hay que darlo de alta ANTES de la 09 —y
-- después de la 01, que es la que crea `profiles` y el trigger que lo llena.
--
-- El corredor aplica este archivo justo después de docs/supabase/01_schema.sql.
insert into auth.users (id, email, raw_user_meta_data)
values ('a6cdf641-1f69-47cd-ac3b-f8fae208e22e', 'operador@pruebas.local', '{"full_name":"admin"}');
