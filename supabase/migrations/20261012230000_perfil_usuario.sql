-- =====================================================================================
-- LANCEX: perfil configurable del usuario (bio y ciudad).
-- Columnas opcionales y aditivas: no rompen filas existentes. Los GRANT de app_user son de
-- tabla (SELECT, INSERT, UPDATE), así que lancex_app ya puede leerlas y escribirlas.
-- NUNCA editar este archivo una vez aplicado: crear otro.
-- =====================================================================================
SET search_path = lancex, public;

ALTER TABLE app_user
    ADD COLUMN bio varchar(300)
        CHECK (bio IS NULL OR char_length(btrim(bio)) BETWEEN 1 AND 300),
    ADD COLUMN location_city varchar(80)
        CHECK (location_city IS NULL OR char_length(btrim(location_city)) BETWEEN 2 AND 80);

COMMENT ON COLUMN app_user.bio IS 'Presentación pública opcional (texto plano, sin URLs).';
COMMENT ON COLUMN app_user.location_city IS 'Ciudad pública opcional del perfil.';
