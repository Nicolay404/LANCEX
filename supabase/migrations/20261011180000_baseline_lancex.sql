-- =====================================================================================
-- LANCEX: migración base (LX-02)
-- Fuente: documentacion/03-dominio/MODELO-DE-DATOS-INICIAL.md, ADR-0003, ADR-0005, ADR-0006.
--
-- Reglas: SQL portable a PostgreSQL estándar (sin esquemas auth/storage de Supabase),
-- enumerados como text + CHECK, dinero numeric(12,2), instantes timestamptz,
-- uuid con gen_random_uuid(), RLS activado y GRANT explícitos a lancex_app.
--
-- NUNCA editar este archivo una vez aplicado en el proyecto compartido: crear otro.
-- La contraseña de lancex_app NO está aquí: se fija fuera de Git (ver GESTION-DEL-ESQUEMA.md).
-- =====================================================================================

-- ---------------------------------------------------------------------------------
-- Esquema y rol de aplicación
-- ---------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS lancex;
COMMENT ON SCHEMA lancex IS 'Dominio de LANCEX. No expuesto en la Data API de Supabase.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lancex_app') THEN
        CREATE ROLE lancex_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
    END IF;
END
$$;
COMMENT ON ROLE lancex_app IS 'Rol de Django: solo DML según tabla, sin DDL (ADR-0003).';

ALTER ROLE lancex_app SET search_path = lancex, public;

REVOKE ALL ON SCHEMA lancex FROM PUBLIC;
GRANT USAGE ON SCHEMA lancex TO lancex_app;

SET search_path = lancex, public;

-- Función común: updated_at con la hora de PostgreSQL.
CREATE FUNCTION lancex.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------------
-- Identidad
-- ---------------------------------------------------------------------------------
CREATE TABLE app_user (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email              varchar(254) NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
    password           varchar(128) NOT NULL,
    display_name       varchar(60)  NOT NULL CHECK (char_length(display_name) BETWEEN 3 AND 60),
    is_active          boolean      NOT NULL DEFAULT true,
    platform_role      text         NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user', 'moderator', 'admin')),
    status             text         NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    status_reason      varchar(300),
    status_changed_at  timestamptz,
    status_changed_by  uuid REFERENCES app_user (id) ON DELETE RESTRICT,
    last_login         timestamptz,
    created_at         timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_user_email_lower_uq ON app_user (lower(email));
COMMENT ON TABLE app_user IS 'Usuarios. Se suspenden, nunca se eliminan. password = hash de Django.';

CREATE TABLE django_session (
    session_key   varchar(40) PRIMARY KEY,
    session_data  text        NOT NULL,
    expire_date   timestamptz NOT NULL,
    user_id       uuid        REFERENCES app_user (id) ON DELETE CASCADE
);
CREATE INDEX django_session_expire_date_idx ON django_session (expire_date);
CREATE INDEX django_session_user_id_idx ON django_session (user_id);
COMMENT ON TABLE django_session IS 'Sesiones de Django + user_id para revocar todas las sesiones de un usuario.';

CREATE TABLE django_cache (
    cache_key  varchar(255) PRIMARY KEY,
    value      text         NOT NULL,
    expires    timestamptz  NOT NULL
);
CREATE INDEX django_cache_expires_idx ON django_cache (expires);
COMMENT ON TABLE django_cache IS 'DatabaseCache: throttling y bloqueo de login compartidos entre backends.';

CREATE TABLE organization (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name           varchar(160) NOT NULL,
    ruc                  char(13)     NOT NULL UNIQUE CHECK (ruc ~ '^[0-9]{13}$'),
    is_buyer             boolean      NOT NULL DEFAULT false,
    is_supplier          boolean      NOT NULL DEFAULT false,
    verification_status  text         NOT NULL DEFAULT 'pending'
                         CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verification_note    varchar(300),
    created_by_user_id   uuid         NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    created_at           timestamptz  NOT NULL DEFAULT now(),
    CHECK (is_buyer OR is_supplier)
);
COMMENT ON TABLE organization IS 'Organizaciones B2B (compradoras y/o proveedoras).';

CREATE TABLE organization_membership (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES organization (id) ON DELETE RESTRICT,
    user_id          uuid        NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    role             text        NOT NULL CHECK (role IN ('owner', 'member')),
    status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_membership_user_idx ON organization_membership (user_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------------
CREATE TABLE category (
    id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       varchar(60) NOT NULL,
    slug       varchar(60) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
    is_active  boolean     NOT NULL DEFAULT true
);
COMMENT ON TABLE category IS 'Categorías; se desactivan, no se borran.';

CREATE TABLE listing (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   uuid         NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    category_id     smallint     NOT NULL REFERENCES category (id) ON DELETE RESTRICT,
    title           varchar(120) NOT NULL CHECK (char_length(btrim(title)) > 0),
    description     text         NOT NULL CHECK (char_length(description) <= 5000),
    item_condition  text         NOT NULL CHECK (item_condition IN ('new', 'used', 'refurbished')),
    location_city   varchar(80)  NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX listing_owner_idx ON listing (owner_user_id);
CREATE TRIGGER listing_touch BEFORE UPDATE ON listing FOR EACH ROW EXECUTE FUNCTION lancex.touch_updated_at();

CREATE TABLE listing_image (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id    uuid        NOT NULL REFERENCES listing (id) ON DELETE RESTRICT,
    storage_path  text        NOT NULL UNIQUE,
    content_type  text        NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes    integer     NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    position      smallint    NOT NULL CHECK (position BETWEEN 0 AND 5),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_image_listing_idx ON listing_image (listing_id, position);

CREATE TABLE procurement_request (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_organization_id   uuid           NOT NULL REFERENCES organization (id) ON DELETE RESTRICT,
    created_by_user_id      uuid           NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    title                   varchar(120)   NOT NULL,
    specifications          text           NOT NULL CHECK (char_length(specifications) <= 5000),
    quantity                numeric(14, 3) NOT NULL CHECK (quantity > 0),
    unit                    varchar(20)    NOT NULL,
    mandatory_requirements  jsonb          NOT NULL DEFAULT '[]'::jsonb
                            CHECK (jsonb_typeof(mandatory_requirements) = 'array'
                                   AND jsonb_array_length(mandatory_requirements) <= 20),
    delivery_deadline       date           NOT NULL,
    delivery_location       varchar(120)   NOT NULL,
    created_at              timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX procurement_request_org_idx ON procurement_request (buyer_organization_id);

-- ---------------------------------------------------------------------------------
-- Subastas
-- ---------------------------------------------------------------------------------
CREATE TABLE auction (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id            uuid           NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    organization_id          uuid           REFERENCES organization (id) ON DELETE RESTRICT,
    listing_id               uuid           REFERENCES listing (id) ON DELETE RESTRICT,
    procurement_request_id   uuid           UNIQUE REFERENCES procurement_request (id) ON DELETE RESTRICT,
    mechanism                text           NOT NULL CHECK (mechanism IN ('ascending', 'reverse', 'sealed')),
    closing_policy           text           NOT NULL CHECK (closing_policy IN ('fixed', 'soft_close', 'candle')),
    proxy_enabled            boolean        NOT NULL DEFAULT false,
    status                   text           NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'scheduled', 'active', 'closed', 'cancelled')),
    outcome                  text           CHECK (outcome IN ('awarded', 'unsold')),
    currency                 char(3)        NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    starting_price           numeric(12, 2) CHECK (starting_price BETWEEN 0.01 AND 999999999.99),
    reserve_price            numeric(12, 2) CHECK (reserve_price BETWEEN 0.01 AND 999999999.99),
    min_increment            numeric(12, 2) CHECK (min_increment BETWEEN 0.01 AND 999999999.99),
    reference_budget         numeric(12, 2) CHECK (reference_budget BETWEEN 0.01 AND 999999999.99),
    min_decrement            numeric(12, 2) CHECK (min_decrement BETWEEN 0.01 AND 999999999.99),
    starts_at                timestamptz,
    ends_at                  timestamptz,
    original_ends_at         timestamptz,
    soft_close_window_s      integer        CHECK (soft_close_window_s > 0),
    soft_close_extension_s   integer        CHECK (soft_close_extension_s > 0),
    soft_close_max_total_s   integer        CHECK (soft_close_max_total_s > 0),
    candle_window_s          integer        CHECK (candle_window_s > 0),
    candle_commitment        char(64)       CHECK (candle_commitment ~ '^[0-9a-f]{64}$'),
    candle_seed              bytea,
    candle_close_at          timestamptz,
    rules_snapshot           jsonb,
    published_at             timestamptz,
    current_price            numeric(12, 2),
    leader_user_id           uuid           REFERENCES app_user (id) ON DELETE RESTRICT,
    leader_organization_id   uuid           REFERENCES organization (id) ON DELETE RESTRICT,
    bid_count                integer        NOT NULL DEFAULT 0 CHECK (bid_count >= 0),
    active_offer_count       integer        NOT NULL DEFAULT 0 CHECK (active_offer_count >= 0),
    version                  bigint         NOT NULL DEFAULT 0 CHECK (version >= 0),
    winner_user_id           uuid           REFERENCES app_user (id) ON DELETE RESTRICT,
    winner_organization_id   uuid           REFERENCES organization (id) ON DELETE RESTRICT,
    final_price              numeric(12, 2),
    closed_at                timestamptz,
    cancelled_at             timestamptz,
    cancel_reason            varchar(300),
    settlement_status        text           CHECK (settlement_status IN ('pending', 'completed', 'failed')),
    settlement_note          varchar(300),
    created_at               timestamptz    NOT NULL DEFAULT now(),
    updated_at               timestamptz    NOT NULL DEFAULT now(),

    -- Matriz de compatibilidad de ADR-0005.
    CONSTRAINT auction_mechanism_matrix CHECK (
        mechanism = 'ascending'
        OR (mechanism = 'reverse' AND closing_policy IN ('fixed', 'soft_close'))
        OR (mechanism = 'sealed' AND closing_policy = 'fixed')
    ),
    CONSTRAINT auction_proxy_only_ascending CHECK (NOT proxy_enabled OR mechanism = 'ascending'),
    -- Origen: publicación (ascending/sealed) o necesidad B2B de una organización (reverse).
    CONSTRAINT auction_source CHECK (
        (mechanism = 'reverse' AND procurement_request_id IS NOT NULL AND organization_id IS NOT NULL
             AND listing_id IS NULL)
        OR (mechanism <> 'reverse' AND listing_id IS NOT NULL AND procurement_request_id IS NULL)
    ),
    CONSTRAINT auction_window CHECK (ends_at > starts_at),
    CONSTRAINT auction_soft_close_params CHECK (
        closing_policy = 'soft_close'
        OR (soft_close_window_s IS NULL AND soft_close_extension_s IS NULL AND soft_close_max_total_s IS NULL)
    ),
    CONSTRAINT auction_candle_params CHECK (
        closing_policy = 'candle'
        OR (candle_window_s IS NULL AND candle_commitment IS NULL AND candle_seed IS NULL AND candle_close_at IS NULL)
    ),
    CONSTRAINT auction_outcome_only_closed CHECK (outcome IS NULL OR status = 'closed'),
    CONSTRAINT auction_settlement_only_awarded CHECK (settlement_status IS NULL OR outcome = 'awarded')
);
CREATE INDEX auction_status_ends_idx ON auction (status, ends_at);
CREATE INDEX auction_owner_idx ON auction (owner_user_id);
CREATE INDEX auction_listing_idx ON auction (listing_id);
CREATE INDEX auction_mechanism_status_idx ON auction (mechanism, status);
CREATE UNIQUE INDEX auction_one_open_per_listing_uq ON auction (listing_id)
    WHERE status IN ('draft', 'scheduled', 'active');
CREATE TRIGGER auction_touch BEFORE UPDATE ON auction FOR EACH ROW EXECUTE FUNCTION lancex.touch_updated_at();
COMMENT ON COLUMN auction.reserve_price IS 'PRIVADO: nunca se expone; solo reserve_met.';
COMMENT ON COLUMN auction.candle_seed IS 'PRIVADO hasta el cierre.';
COMMENT ON COLUMN auction.candle_close_at IS 'PRIVADO hasta el cierre.';
COMMENT ON COLUMN auction.version IS 'Se incrementa en cada cambio visible (ETag de live/).';

CREATE TABLE proxy_bid_limit (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id  uuid           NOT NULL REFERENCES auction (id) ON DELETE RESTRICT,
    user_id     uuid           NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    max_amount  numeric(12, 2) NOT NULL CHECK (max_amount BETWEEN 0.01 AND 999999999.99),
    status      text           NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'cancelled')),
    created_at  timestamptz    NOT NULL DEFAULT now(),
    updated_at  timestamptz    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX proxy_bid_limit_one_active_uq ON proxy_bid_limit (auction_id, user_id) WHERE status = 'active';
CREATE TRIGGER proxy_bid_limit_touch BEFORE UPDATE ON proxy_bid_limit
    FOR EACH ROW EXECUTE FUNCTION lancex.touch_updated_at();
COMMENT ON TABLE proxy_bid_limit IS 'PRIVADO: máximos de proxy bidding.';

CREATE TABLE bid (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id       uuid           NOT NULL REFERENCES auction (id) ON DELETE RESTRICT,
    seq              integer        NOT NULL CHECK (seq > 0),
    bidder_user_id   uuid           NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    organization_id  uuid           REFERENCES organization (id) ON DELETE RESTRICT,
    amount           numeric(12, 2) NOT NULL CHECK (amount BETWEEN 0.01 AND 999999999.99),
    unit_price       numeric(14, 4) CHECK (unit_price > 0),
    shipping_cost    numeric(12, 2) CHECK (shipping_cost >= 0),
    source           text           NOT NULL CHECK (source IN ('manual', 'proxy')),
    proxy_limit_id   uuid           REFERENCES proxy_bid_limit (id) ON DELETE RESTRICT,
    idempotency_key  uuid,
    accepted_at      timestamptz    NOT NULL DEFAULT clock_timestamp(),
    counted          boolean        NOT NULL DEFAULT true,
    UNIQUE (auction_id, seq),
    UNIQUE (auction_id, bidder_user_id, idempotency_key),
    CHECK ((source = 'proxy') = (proxy_limit_id IS NOT NULL)),
    CHECK (source = 'proxy' OR idempotency_key IS NOT NULL)
);
CREATE INDEX bid_bidder_idx ON bid (bidder_user_id);
COMMENT ON TABLE bid IS 'Libro de pujas aceptadas. Orden oficial: seq. Sin DELETE.';

CREATE TABLE sealed_offer (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id       uuid           NOT NULL REFERENCES auction (id) ON DELETE RESTRICT,
    bidder_user_id   uuid           NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    amount           numeric(12, 2) NOT NULL CHECK (amount BETWEEN 0.01 AND 999999999.99),
    seq              integer        NOT NULL CHECK (seq > 0),
    is_current       boolean        NOT NULL DEFAULT true,
    status           text           NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
    idempotency_key  uuid           NOT NULL,
    submitted_at     timestamptz    NOT NULL DEFAULT clock_timestamp(),
    revealed_at      timestamptz,
    UNIQUE (auction_id, seq),
    UNIQUE (auction_id, bidder_user_id, idempotency_key)
);
CREATE UNIQUE INDEX sealed_offer_one_current_uq ON sealed_offer (auction_id, bidder_user_id) WHERE is_current;
COMMENT ON TABLE sealed_offer IS 'PRIVADO hasta el cierre: ofertas de sobre cerrado.';

CREATE TABLE auction_participant (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id             uuid         NOT NULL REFERENCES auction (id) ON DELETE RESTRICT,
    organization_id        uuid         NOT NULL REFERENCES organization (id) ON DELETE RESTRICT,
    registered_by_user_id  uuid         NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    status                 text         NOT NULL DEFAULT 'registered'
                           CHECK (status IN ('registered', 'admitted', 'rejected')),
    compliance             jsonb        NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(compliance) = 'array'),
    decision_reason        varchar(300),
    decided_by_user_id     uuid         REFERENCES app_user (id) ON DELETE RESTRICT,
    decided_at             timestamptz,
    registered_at          timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (auction_id, organization_id)
);

-- ---------------------------------------------------------------------------------
-- Transversales
-- ---------------------------------------------------------------------------------
CREATE TABLE audit_event (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    actor_user_id  uuid,
    action         varchar(60) NOT NULL,
    entity_type    varchar(40) NOT NULL,
    entity_id      uuid,
    auction_id     uuid,
    request_id     varchar(64),
    data           jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_event_auction_idx ON audit_event (auction_id, occurred_at);
CREATE INDEX audit_event_entity_idx ON audit_event (entity_type, entity_id);
COMMENT ON TABLE audit_event IS 'Auditoría de negocio append-only (ADR-0002). Sin secretos ni importes privados.';

CREATE FUNCTION lancex.audit_event_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_event es append-only: % no permitido', TG_OP USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER audit_event_no_update_delete BEFORE UPDATE OR DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION lancex.audit_event_append_only();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON audit_event
    FOR EACH STATEMENT EXECUTE FUNCTION lancex.audit_event_append_only();

CREATE TABLE notification (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    type        varchar(40) NOT NULL,
    auction_id  uuid        REFERENCES auction (id) ON DELETE RESTRICT,
    data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    read_at     timestamptz
);
CREATE INDEX notification_user_idx ON notification (user_id, read_at, created_at DESC);

CREATE TABLE watchlist (
    user_id     uuid        NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    auction_id  uuid        NOT NULL REFERENCES auction (id) ON DELETE RESTRICT,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, auction_id)
);

CREATE TABLE report (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id     uuid         NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    target_type          text         NOT NULL CHECK (target_type IN ('auction', 'listing', 'user')),
    target_id            uuid         NOT NULL,
    reason               text         NOT NULL CHECK (reason IN ('fraud', 'prohibited_item', 'misleading', 'other')),
    detail               varchar(500) NOT NULL DEFAULT '',
    status               text         NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
    resolution_note      varchar(300),
    resolved_by_user_id  uuid         REFERENCES app_user (id) ON DELETE RESTRICT,
    resolved_at          timestamptz,
    created_at           timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (reporter_user_id, target_type, target_id)
);
CREATE INDEX report_status_idx ON report (status, created_at);

CREATE TABLE job_heartbeat (
    dev                varchar(40) PRIMARY KEY,
    job                varchar(40) NOT NULL,
    last_run_at        timestamptz NOT NULL,
    last_closed_count  integer     NOT NULL DEFAULT 0 CHECK (last_closed_count >= 0)
);

CREATE TABLE rating (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id     uuid         NOT NULL REFERENCES auction (id) ON DELETE RESTRICT,
    rater_user_id  uuid         NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    ratee_user_id  uuid         NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
    score          smallint     NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment        varchar(300) NOT NULL DEFAULT '',
    created_at     timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (auction_id, rater_user_id),
    CHECK (rater_user_id <> ratee_user_id)
);
CREATE INDEX rating_ratee_idx ON rating (ratee_user_id);

-- ---------------------------------------------------------------------------------
-- Grants: mínimos por tabla (ADR-0003). Sin DDL, sin TRUNCATE.
-- ---------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA lancex FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA lancex FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lancex FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE         ON app_user                TO lancex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON django_session          TO lancex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON django_cache            TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON organization            TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON organization_membership TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON category                TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON listing                 TO lancex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON listing_image           TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON procurement_request     TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON auction                 TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON proxy_bid_limit         TO lancex_app;
GRANT SELECT, INSERT                 ON bid                     TO lancex_app;
GRANT UPDATE (counted)               ON bid                     TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON sealed_offer            TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON auction_participant     TO lancex_app;
GRANT SELECT, INSERT                 ON audit_event             TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON notification            TO lancex_app;
GRANT SELECT, INSERT, DELETE         ON watchlist               TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON report                  TO lancex_app;
GRANT SELECT, INSERT, UPDATE         ON job_heartbeat           TO lancex_app;
GRANT SELECT, INSERT                 ON rating                  TO lancex_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA lancex TO lancex_app;
GRANT EXECUTE ON FUNCTION lancex.touch_updated_at() TO lancex_app;
GRANT EXECUTE ON FUNCTION lancex.audit_event_append_only() TO lancex_app;

-- ---------------------------------------------------------------------------------
-- Row Level Security (defensa en profundidad)
-- RLS se activa en todas las tablas. La única política es para lancex_app (el backend):
-- sin ella, RLS también bloquearía a Django, que no es dueño de las tablas.
-- anon y authenticated (Data API de Supabase) no tienen grants ni políticas.
-- ---------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'lancex' LOOP
        EXECUTE format('ALTER TABLE lancex.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY lancex_app_backend ON lancex.%I TO lancex_app USING (true) WITH CHECK (true)', t
        );
    END LOOP;
END
$$;
