-- =====================================================================================
-- LANCEX: doble factor (TOTP) y restablecimiento de contraseña emitido por un admin.
--
-- Tablas NUEVAS (no se toca app_user): si el código llega antes que esta migración, solo
-- fallan las funciones nuevas, no el resto de la aplicación.
-- Ningún secreto en claro salvo el secreto TOTP, que el servidor necesita para verificar
-- códigos (protegido por grants a lancex_app y RLS). Códigos de respaldo y tokens de
-- restablecimiento se guardan solo como SHA-256.
-- NUNCA editar este archivo una vez aplicado: crear otro.
-- =====================================================================================
SET search_path = lancex, public;

-- 2FA activo de un usuario (una fila por usuario; sin fila = sin 2FA).
CREATE TABLE user_mfa (
    user_id     uuid        PRIMARY KEY REFERENCES app_user (id) ON DELETE RESTRICT,
    secret      char(32)    NOT NULL CHECK (secret ~ '^[A-Z2-7]{32}$'),  -- base32 de 20 bytes (RFC 6238)
    last_step   bigint      CHECK (last_step >= 0),                      -- anti-repetición del último código
    enabled_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_mfa IS 'PRIVADO: secreto TOTP. Nunca se expone tras la activación ni se escribe en logs.';

-- Códigos de respaldo de un solo uso (solo su hash).
CREATE TABLE mfa_recovery_code (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    code_hash   char(64)    NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_code_user_idx ON mfa_recovery_code (user_id) WHERE used_at IS NULL;

-- Enlaces de restablecimiento de contraseña de un solo uso emitidos por un admin.
CREATE TABLE password_reset_token (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid        NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    token_hash          char(64)    NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_by_user_id  uuid        NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    expires_at          timestamptz NOT NULL,
    used_at             timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK (user_id <> created_by_user_id)
);
CREATE INDEX password_reset_token_user_idx ON password_reset_token (user_id) WHERE used_at IS NULL;
COMMENT ON TABLE password_reset_token IS 'Solo el hash del token; el token en claro se muestra una vez al admin.';

-- Grants mínimos (ADR-0003): sin DDL ni TRUNCATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_mfa             TO lancex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_recovery_code    TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON password_reset_token TO lancex_app;

-- RLS como en la base (ADR-0007): única política para el backend.
ALTER TABLE user_mfa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_code    ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY lancex_app_backend ON user_mfa             TO lancex_app USING (true) WITH CHECK (true);
CREATE POLICY lancex_app_backend ON mfa_recovery_code    TO lancex_app USING (true) WITH CHECK (true);
CREATE POLICY lancex_app_backend ON password_reset_token TO lancex_app USING (true) WITH CHECK (true);
