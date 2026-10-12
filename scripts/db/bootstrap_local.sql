-- Prepara un PostgreSQL local/CI para que se parezca a Supabase (LX-03).
-- Supabase ya trae estos roles; aquí se crean vacíos para que las migraciones sean portables.
-- Solo para bases locales o de CI. NUNCA contra el proyecto compartido.

DO $$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', r);
        END IF;
    END LOOP;
END
$$;
