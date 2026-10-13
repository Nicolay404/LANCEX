-- =====================================================================================
-- LANCEX: datos de demostración para Supabase (solo DML, sin cambios de esquema).
--
-- Cómo usarlo: Supabase -> SQL Editor -> New query -> pegar TODO el archivo -> Run.
--
-- - Se ejecuta como UNA sola transacción: si algo falla, no se guarda nada.
-- - Idempotente: si ya existen publicaciones "[DEMO]", no crea nada y avisa.
-- - Las horas son relativas a la hora de PostgreSQL al ejecutarlo (subastas activas
--   durante ~2 h, una programada para mañana, otras ya cerradas).
-- - La contraseña de las cuentas demo NO está aquí: solo su hash de Django.
-- - No crea administrador: usar `python manage.py bootstrap_admin`.
-- - Requiere pgcrypto (Supabase lo trae en el esquema `extensions`).
-- =====================================================================================
SET search_path = lancex, public, extensions;

DO $$
DECLARE
    v_now   timestamptz := clock_timestamp();
    v_hash  text := 'pbkdf2_sha256$1000000$EYLsKJXbRir0WPBulJ1jcF$QKAOIF1yPeDkNURyKhCZXyXHuPzjIFvhXbXmbQIAx8Q=';
    -- usuarios
    u_ana uuid; u_beto uuid; u_carla uuid; u_diego uuid; u_eva uuid; u_fer uuid; u_mod uuid;
    -- organizaciones
    o_buyer uuid; o_sup1 uuid; o_sup2 uuid; o_pend uuid;
    -- categorías
    c_tec smallint; c_veh smallint; c_hog smallint; c_arte smallint; c_ins smallint; c_otros smallint;
    -- publicaciones, necesidad y subastas
    l uuid; need uuid; a uuid; b uuid;
    -- vela
    v_seed bytea; v_hmac bytea; v_off numeric; v_ends timestamptz; v_close timestamptz;
    i int;
BEGIN
    IF EXISTS (SELECT 1 FROM listing WHERE title LIKE '[DEMO]%') THEN
        RAISE NOTICE 'Ya existen datos [DEMO]: no se crea nada.';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------- categorías
    INSERT INTO category (name, slug) VALUES
        ('Vehículos', 'vehiculos'), ('Tecnología', 'tecnologia'), ('Hogar y muebles', 'hogar-y-muebles'),
        ('Maquinaria y equipos', 'maquinaria-y-equipos'), ('Arte y colección', 'arte-y-coleccion'),
        ('Inmuebles', 'inmuebles'), ('Insumos y suministros', 'insumos-y-suministros'), ('Otros', 'otros')
    ON CONFLICT (slug) DO NOTHING;
    SELECT id INTO c_tec   FROM category WHERE slug = 'tecnologia';
    SELECT id INTO c_veh   FROM category WHERE slug = 'vehiculos';
    SELECT id INTO c_hog   FROM category WHERE slug = 'hogar-y-muebles';
    SELECT id INTO c_arte  FROM category WHERE slug = 'arte-y-coleccion';
    SELECT id INTO c_ins   FROM category WHERE slug = 'insumos-y-suministros';
    SELECT id INTO c_otros FROM category WHERE slug = 'otros';

    -- ---------------------------------------------------------------- usuarios
    INSERT INTO app_user (email, password, display_name, platform_role, bio, location_city, created_at) VALUES
        ('ana@demo.lancex.test',       v_hash, 'Ana Demo',       'user', 'Vendo tecnología usada en buen estado.', 'Loja',   v_now - interval '20 days'),
        ('beto@demo.lancex.test',      v_hash, 'Beto Demo',      'user', 'Coleccionista de arte y muebles.',       'Cuenca', v_now - interval '18 days'),
        ('carla@demo.lancex.test',     v_hash, 'Carla Demo',     'user', 'Compras institucionales.',               'Loja',   v_now - interval '15 days'),
        ('diego@demo.lancex.test',     v_hash, 'Diego Demo',     'user', 'Proveedor de suministros de oficina.',   'Quito',  v_now - interval '12 days'),
        ('eva@demo.lancex.test',       v_hash, 'Eva Demo',       'user', NULL,                                     'Loja',   v_now - interval '10 days'),
        ('fer@demo.lancex.test',       v_hash, 'Fer Demo',       'user', NULL,                                     NULL,     v_now - interval '5 days'),
        ('moderador@demo.lancex.test', v_hash, 'Moderador Demo', 'moderator', NULL,                                NULL,     v_now - interval '20 days')
    ON CONFLICT DO NOTHING;
    SELECT id INTO u_ana   FROM app_user WHERE email = 'ana@demo.lancex.test';
    SELECT id INTO u_beto  FROM app_user WHERE email = 'beto@demo.lancex.test';
    SELECT id INTO u_carla FROM app_user WHERE email = 'carla@demo.lancex.test';
    SELECT id INTO u_diego FROM app_user WHERE email = 'diego@demo.lancex.test';
    SELECT id INTO u_eva   FROM app_user WHERE email = 'eva@demo.lancex.test';
    SELECT id INTO u_fer   FROM app_user WHERE email = 'fer@demo.lancex.test';
    SELECT id INTO u_mod   FROM app_user WHERE email = 'moderador@demo.lancex.test';

    INSERT INTO audit_event (actor_user_id, action, entity_type, entity_id, data)
    SELECT id, 'user_registered', 'user', id, '{"source": "seed_demo_sql"}'::jsonb
    FROM app_user WHERE id IN (u_ana, u_beto, u_carla, u_diego, u_eva, u_fer, u_mod);

    -- ---------------------------------------------------------------- organizaciones
    INSERT INTO organization (legal_name, ruc, is_buyer, is_supplier, verification_status, verification_note, created_by_user_id)
    VALUES ('[DEMO] Compras Loja S.A.', '1790000000001', true, false, 'verified', 'Organización demo', u_carla)
    RETURNING id INTO o_buyer;
    INSERT INTO organization (legal_name, ruc, is_buyer, is_supplier, verification_status, verification_note, created_by_user_id)
    VALUES ('[DEMO] Suministros del Sur', '1790000000002', false, true, 'verified', 'Organización demo', u_diego)
    RETURNING id INTO o_sup1;
    INSERT INTO organization (legal_name, ruc, is_buyer, is_supplier, verification_status, verification_note, created_by_user_id)
    VALUES ('[DEMO] Papelería Andina', '1790000000003', false, true, 'verified', 'Organización demo', u_eva)
    RETURNING id INTO o_sup2;
    INSERT INTO organization (legal_name, ruc, is_buyer, is_supplier, verification_status, created_by_user_id)
    VALUES ('[DEMO] Comercial Pendiente', '1790000000004', true, true, 'pending', u_fer)
    RETURNING id INTO o_pend;

    INSERT INTO organization_membership (organization_id, user_id, role) VALUES
        (o_buyer, u_carla, 'owner'), (o_sup1, u_diego, 'owner'), (o_sup2, u_eva, 'owner'), (o_pend, u_fer, 'owner');

    INSERT INTO audit_event (actor_user_id, action, entity_type, entity_id, data) VALUES
        (u_carla, 'organization_created', 'organization', o_buyer, '{}'),
        (u_diego, 'organization_created', 'organization', o_sup1, '{}'),
        (u_eva,   'organization_created', 'organization', o_sup2, '{}'),
        (u_fer,   'organization_created', 'organization', o_pend, '{}'),
        (u_mod,   'organization_verified', 'organization', o_buyer, '{"status": "verified"}'),
        (u_mod,   'organization_verified', 'organization', o_sup1, '{"status": "verified"}'),
        (u_mod,   'organization_verified', 'organization', o_sup2, '{"status": "verified"}');

    -- ================================================================ SUBASTAS
    -- 1) Ascendente, cierre fijo, ACTIVA, con 4 pujas y precio de reserva no alcanzado.
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_ana, c_tec, '[DEMO] Laptop ThinkPad T14', '16 GB RAM, SSD 512 GB, batería nueva.', 'used', 'Loja')
    RETURNING id INTO l;
    INSERT INTO auction (owner_user_id, listing_id, mechanism, closing_policy, status, starting_price, min_increment,
                         reserve_price, starts_at, ends_at, original_ends_at, published_at, current_price,
                         leader_user_id, bid_count, version, rules_snapshot)
    VALUES (u_ana, l, 'ascending', 'fixed', 'scheduled', 300.00, 10.00, 450.00,
            v_now - interval '1 day', v_now + interval '2 hours', v_now + interval '2 hours', v_now - interval '1 day',
            380.00, u_diego, 4, 5,
            jsonb_build_object('mechanism', 'ascending', 'closing_policy', 'fixed', 'proxy_enabled', false,
                'starting_price', '300.00', 'min_increment', '10.00', 'has_reserve', true,
                'starts_at', v_now - interval '1 day', 'ends_at', v_now + interval '2 hours',
                'soft_close_window_s', NULL, 'soft_close_extension_s', NULL, 'soft_close_max_total_s', NULL,
                'reference_budget', NULL, 'min_decrement', NULL, 'quantity', NULL,
                'candle_window_s', NULL, 'candle_commitment', NULL))
    RETURNING id INTO a;
    INSERT INTO bid (auction_id, seq, bidder_user_id, amount, source, idempotency_key, accepted_at) VALUES
        (a, 1, u_beto,  300.00, 'manual', gen_random_uuid(), v_now - interval '20 hours'),
        (a, 2, u_carla, 320.00, 'manual', gen_random_uuid(), v_now - interval '15 hours'),
        (a, 3, u_beto,  350.00, 'manual', gen_random_uuid(), v_now - interval '6 hours'),
        (a, 4, u_diego, 380.00, 'manual', gen_random_uuid(), v_now - interval '1 hour');
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (v_now - interval '1 day', u_ana, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}');
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    SELECT accepted_at, bidder_user_id, 'bid_accepted', 'bid', id, a,
           jsonb_build_object('seq', seq, 'amount', to_char(amount, 'FM999999990.00'), 'source', source)
    FROM bid WHERE auction_id = a;
    INSERT INTO watchlist (user_id, auction_id) VALUES (u_carla, a), (u_beto, a);
    INSERT INTO notification (user_id, type, auction_id, data, created_at) VALUES
        (u_beto, 'outbid', a, '{"current_price": "380.00", "title": "[DEMO] Laptop ThinkPad T14"}', v_now - interval '1 hour');

    -- 2) Ascendente con soft close y proxy bidding, ACTIVA, sin pujas.
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_ana, c_veh, '[DEMO] Bicicleta de montaña', 'Aro 29, frenos de disco, poco uso.', 'used', 'Loja')
    RETURNING id INTO l;
    INSERT INTO auction (owner_user_id, listing_id, mechanism, closing_policy, proxy_enabled, status, starting_price,
                         min_increment, starts_at, ends_at, original_ends_at, published_at, soft_close_window_s,
                         soft_close_extension_s, soft_close_max_total_s, version, rules_snapshot)
    VALUES (u_ana, l, 'ascending', 'soft_close', true, 'scheduled', 120.00, 5.00,
            v_now - interval '10 minutes', v_now + interval '2 hours', v_now + interval '2 hours', v_now - interval '10 minutes',
            120, 120, 3600, 1,
            jsonb_build_object('mechanism', 'ascending', 'closing_policy', 'soft_close', 'proxy_enabled', true,
                'starting_price', '120.00', 'min_increment', '5.00', 'has_reserve', false,
                'starts_at', v_now - interval '10 minutes', 'ends_at', v_now + interval '2 hours',
                'soft_close_window_s', 120, 'soft_close_extension_s', 120, 'soft_close_max_total_s', 3600,
                'reference_budget', NULL, 'min_decrement', NULL, 'quantity', NULL,
                'candle_window_s', NULL, 'candle_commitment', NULL))
    RETURNING id INTO a;
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (v_now - interval '10 minutes', u_ana, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}');

    -- 3) Sobre cerrado (sealed), ACTIVA, con 2 ofertas ocultas.
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_beto, c_arte, '[DEMO] Cuadro al óleo', 'Paisaje lojano, 60x80 cm, firmado.', 'new', 'Cuenca')
    RETURNING id INTO l;
    INSERT INTO auction (owner_user_id, listing_id, mechanism, closing_policy, status, starting_price, starts_at, ends_at,
                         original_ends_at, published_at, active_offer_count, bid_count, version, rules_snapshot)
    VALUES (u_beto, l, 'sealed', 'fixed', 'scheduled', 80.00,
            v_now - interval '3 hours', v_now + interval '2 hours', v_now + interval '2 hours', v_now - interval '3 hours',
            2, 2, 3,  -- en sellada, bid_count es el contador interno de seq de las ofertas (nunca se publica)
            jsonb_build_object('mechanism', 'sealed', 'closing_policy', 'fixed', 'proxy_enabled', false,
                'starting_price', '80.00', 'min_increment', NULL, 'has_reserve', false,
                'starts_at', v_now - interval '3 hours', 'ends_at', v_now + interval '2 hours',
                'soft_close_window_s', NULL, 'soft_close_extension_s', NULL, 'soft_close_max_total_s', NULL,
                'reference_budget', NULL, 'min_decrement', NULL, 'quantity', NULL,
                'candle_window_s', NULL, 'candle_commitment', NULL))
    RETURNING id INTO a;
    INSERT INTO sealed_offer (auction_id, bidder_user_id, amount, seq, idempotency_key, submitted_at) VALUES
        (a, u_ana,   95.00,  1, gen_random_uuid(), v_now - interval '2 hours'),
        (a, u_carla, 110.00, 2, gen_random_uuid(), v_now - interval '1 hour');
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (v_now - interval '3 hours', u_beto, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}');
    -- La auditoría de ofertas selladas no lleva importes (son privados hasta el cierre).
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    SELECT submitted_at, bidder_user_id, 'sealed_offer_submitted', 'sealed_offer', id, a, '{}'::jsonb
    FROM sealed_offer WHERE auction_id = a;

    -- 4) Ascendente con cierre por VELA (commit-reveal), ACTIVA, termina en 40 min.
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_beto, c_hog, '[DEMO] Juego de comedor', 'Madera de cedro, mesa y 6 sillas.', 'used', 'Cuenca')
    RETURNING id INTO l;
    a := gen_random_uuid();
    v_ends := v_now + interval '40 minutes';
    v_seed := gen_random_bytes(32);
    v_hmac := hmac(uuid_send(a), v_seed, 'sha256');
    v_off := 0;
    FOR i IN 0..7 LOOP
        v_off := v_off * 256 + get_byte(v_hmac, i);
    END LOOP;
    v_off := mod(v_off, 600 * 1000);
    v_close := (v_ends - interval '600 seconds') + (v_off::text || ' milliseconds')::interval;
    INSERT INTO auction (id, owner_user_id, listing_id, mechanism, closing_policy, status, starting_price, min_increment,
                         starts_at, ends_at, original_ends_at, published_at, candle_window_s, candle_seed,
                         candle_commitment, candle_close_at, version, rules_snapshot)
    VALUES (a, u_beto, l, 'ascending', 'candle', 'scheduled', 200.00, 10.00,
            v_now - interval '30 minutes', v_ends, v_ends, v_now - interval '30 minutes', 600, v_seed,
            encode(digest(v_seed, 'sha256'), 'hex'), v_close, 1,
            jsonb_build_object('mechanism', 'ascending', 'closing_policy', 'candle', 'proxy_enabled', false,
                'starting_price', '200.00', 'min_increment', '10.00', 'has_reserve', false,
                'starts_at', v_now - interval '30 minutes', 'ends_at', v_ends,
                'soft_close_window_s', NULL, 'soft_close_extension_s', NULL, 'soft_close_max_total_s', NULL,
                'reference_budget', NULL, 'min_decrement', NULL, 'quantity', NULL,
                'candle_window_s', 600, 'candle_commitment', encode(digest(v_seed, 'sha256'), 'hex')));
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (v_now - interval '30 minutes', u_beto, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}');

    -- 5) Ascendente PROGRAMADA: empieza mañana.
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_ana, c_otros, '[DEMO] Guitarra acústica Yamaha', 'Incluye estuche y cuerdas nuevas.', 'used', 'Loja')
    RETURNING id INTO l;
    INSERT INTO auction (owner_user_id, listing_id, mechanism, closing_policy, status, starting_price, min_increment,
                         starts_at, ends_at, original_ends_at, published_at, version, rules_snapshot)
    VALUES (u_ana, l, 'ascending', 'fixed', 'scheduled', 90.00, 5.00,
            v_now + interval '1 day', v_now + interval '3 days', v_now + interval '3 days', v_now, 1,
            jsonb_build_object('mechanism', 'ascending', 'closing_policy', 'fixed', 'proxy_enabled', false,
                'starting_price', '90.00', 'min_increment', '5.00', 'has_reserve', false,
                'starts_at', v_now + interval '1 day', 'ends_at', v_now + interval '3 days',
                'soft_close_window_s', NULL, 'soft_close_extension_s', NULL, 'soft_close_max_total_s', NULL,
                'reference_budget', NULL, 'min_decrement', NULL, 'quantity', NULL,
                'candle_window_s', NULL, 'candle_commitment', NULL))
    RETURNING id INTO a;
    INSERT INTO audit_event (actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (u_ana, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}');
    INSERT INTO watchlist (user_id, auction_id) VALUES (u_diego, a);

    -- 6) CERRADA y ADJUDICADA: Ana ganó; liquidación pendiente (permite probar liquidar y calificar).
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_carla, c_tec, '[DEMO] Cámara Canon EOS', 'Lente 18-55 mm, 2 baterías.', 'used', 'Loja')
    RETURNING id INTO l;
    INSERT INTO auction (owner_user_id, listing_id, mechanism, closing_policy, status, outcome, starting_price,
                         min_increment, starts_at, ends_at, original_ends_at, published_at, current_price,
                         leader_user_id, bid_count, winner_user_id, final_price, closed_at, settlement_status,
                         version, rules_snapshot)
    VALUES (u_carla, l, 'ascending', 'fixed', 'closed', 'awarded', 150.00, 10.00,
            v_now - interval '4 days', v_now - interval '1 day', v_now - interval '1 day', v_now - interval '4 days',
            200.00, u_ana, 3, u_ana, 200.00, v_now - interval '1 day', 'pending', 5,
            jsonb_build_object('mechanism', 'ascending', 'closing_policy', 'fixed', 'proxy_enabled', false,
                'starting_price', '150.00', 'min_increment', '10.00', 'has_reserve', false,
                'starts_at', v_now - interval '4 days', 'ends_at', v_now - interval '1 day',
                'soft_close_window_s', NULL, 'soft_close_extension_s', NULL, 'soft_close_max_total_s', NULL,
                'reference_budget', NULL, 'min_decrement', NULL, 'quantity', NULL,
                'candle_window_s', NULL, 'candle_commitment', NULL))
    RETURNING id INTO a;
    INSERT INTO bid (auction_id, seq, bidder_user_id, amount, source, idempotency_key, accepted_at) VALUES
        (a, 1, u_ana,  150.00, 'manual', gen_random_uuid(), v_now - interval '3 days'),
        (a, 2, u_beto, 170.00, 'manual', gen_random_uuid(), v_now - interval '2 days'),
        (a, 3, u_ana,  200.00, 'manual', gen_random_uuid(), v_now - interval '30 hours');
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (v_now - interval '4 days', u_carla, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}');
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    SELECT accepted_at, bidder_user_id, 'bid_accepted', 'bid', id, a,
           jsonb_build_object('seq', seq, 'amount', to_char(amount, 'FM999999990.00'), 'source', source)
    FROM bid WHERE auction_id = a;
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (v_now - interval '1 day', NULL, 'auction_closed', 'auction', a, a,
            jsonb_build_object('outcome', 'awarded', 'winner_user_id', u_ana, 'winner_organization_id', NULL,
                               'final_price', '200.00'));
    INSERT INTO notification (user_id, type, auction_id, data, created_at) VALUES
        (u_ana,   'auction_won',          a, '{"outcome": "awarded", "final_price": "200.00", "title": "[DEMO] Cámara Canon EOS"}', v_now - interval '1 day'),
        (u_beto,  'auction_lost',         a, '{"outcome": "awarded", "final_price": "200.00", "title": "[DEMO] Cámara Canon EOS"}', v_now - interval '1 day'),
        (u_carla, 'auction_closed_owner', a, '{"outcome": "awarded", "final_price": "200.00", "title": "[DEMO] Cámara Canon EOS"}', v_now - interval '1 day');

    -- 7) CERRADA sin venta (nadie pujó).
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_diego, c_hog, '[DEMO] Lámpara de pie vintage', 'Bronce, funciona perfecto.', 'used', 'Quito')
    RETURNING id INTO l;
    INSERT INTO auction (owner_user_id, listing_id, mechanism, closing_policy, status, outcome, starting_price,
                         min_increment, starts_at, ends_at, original_ends_at, published_at, closed_at, version,
                         rules_snapshot)
    VALUES (u_diego, l, 'ascending', 'fixed', 'closed', 'unsold', 60.00, 5.00,
            v_now - interval '5 days', v_now - interval '2 days', v_now - interval '2 days', v_now - interval '5 days',
            v_now - interval '2 days', 2,
            jsonb_build_object('mechanism', 'ascending', 'closing_policy', 'fixed', 'proxy_enabled', false,
                'starting_price', '60.00', 'min_increment', '5.00', 'has_reserve', false,
                'starts_at', v_now - interval '5 days', 'ends_at', v_now - interval '2 days',
                'soft_close_window_s', NULL, 'soft_close_extension_s', NULL, 'soft_close_max_total_s', NULL,
                'reference_budget', NULL, 'min_decrement', NULL, 'quantity', NULL,
                'candle_window_s', NULL, 'candle_commitment', NULL))
    RETURNING id INTO a;
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data) VALUES
        (v_now - interval '5 days', u_diego, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}'),
        (v_now - interval '2 days', NULL, 'auction_closed', 'auction', a, a,
         '{"outcome": "unsold", "winner_user_id": null, "winner_organization_id": null, "final_price": null}');
    INSERT INTO notification (user_id, type, auction_id, data, created_at) VALUES
        (u_diego, 'auction_unsold_owner', a, '{"outcome": "unsold", "title": "[DEMO] Lámpara de pie vintage"}', v_now - interval '2 days');

    -- 8) BORRADOR (solo lo ve su dueño en "Mis subastas").
    INSERT INTO listing (owner_user_id, category_id, title, description, item_condition, location_city)
    VALUES (u_diego, c_tec, '[DEMO] Consola PlayStation 5', 'Con 2 mandos y 3 juegos.', 'used', 'Quito')
    RETURNING id INTO l;
    INSERT INTO auction (owner_user_id, listing_id, mechanism, closing_policy, status, starting_price, min_increment,
                         starts_at, ends_at)
    VALUES (u_diego, l, 'ascending', 'fixed', 'draft', 350.00, 10.00, v_now + interval '2 days', v_now + interval '5 days')
    RETURNING id INTO a;
    INSERT INTO audit_event (actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (u_diego, 'auction_created', 'auction', a, a, '{"source": "seed_demo_sql"}');

    -- 9) INVERSA B2B (necesidad de Compras Loja), ACTIVA: un proveedor admitido y otro por decidir.
    INSERT INTO procurement_request (buyer_organization_id, created_by_user_id, title, specifications, quantity, unit,
                                     mandatory_requirements, delivery_deadline, delivery_location)
    VALUES (o_buyer, u_carla, '[DEMO] Resmas de papel A4', 'Papel bond 75 g/m2, caja de 10 resmas.', 100.000, 'caja',
            '[{"code": "R1", "description": "Entrega con factura electrónica"}]'::jsonb,
            (v_now + interval '30 days')::date, 'Loja, centro')
    RETURNING id INTO need;
    INSERT INTO auction (owner_user_id, organization_id, procurement_request_id, mechanism, closing_policy, status,
                         reference_budget, min_decrement, starts_at, ends_at, original_ends_at, published_at, version,
                         rules_snapshot)
    VALUES (u_carla, o_buyer, need, 'reverse', 'fixed', 'scheduled', 2500.00, 10.00,
            v_now - interval '1 hour', v_now + interval '3 hours', v_now + interval '3 hours', v_now - interval '2 hours', 1,
            jsonb_build_object('mechanism', 'reverse', 'closing_policy', 'fixed', 'proxy_enabled', false,
                'starting_price', NULL, 'min_increment', NULL, 'has_reserve', false,
                'starts_at', v_now - interval '1 hour', 'ends_at', v_now + interval '3 hours',
                'soft_close_window_s', NULL, 'soft_close_extension_s', NULL, 'soft_close_max_total_s', NULL,
                'reference_budget', '2500.00', 'min_decrement', '10.00', 'quantity', '100.000',
                'candle_window_s', NULL, 'candle_commitment', NULL))
    RETURNING id INTO a;
    INSERT INTO auction_participant (auction_id, organization_id, registered_by_user_id, status, compliance,
                                     decided_by_user_id, decided_at, registered_at)
    VALUES (a, o_sup1, u_diego, 'admitted',
            '[{"code": "R1", "complies": true, "comment": "Emitimos factura electrónica"}]'::jsonb,
            u_carla, v_now - interval '90 minutes', v_now - interval '100 minutes');
    INSERT INTO auction_participant (auction_id, organization_id, registered_by_user_id, status, compliance, registered_at)
    VALUES (a, o_sup2, u_eva, 'registered',
            '[{"code": "R1", "complies": true, "comment": "Facturamos en línea"}]'::jsonb, v_now - interval '20 minutes');
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    VALUES (v_now - interval '2 hours', u_carla, 'auction_published', 'auction', a, a, '{"source": "seed_demo_sql"}');
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    SELECT registered_at, registered_by_user_id, 'participant_registered', 'auction_participant', id, a, '{}'::jsonb
    FROM auction_participant WHERE auction_id = a;
    INSERT INTO audit_event (occurred_at, actor_user_id, action, entity_type, entity_id, auction_id, data)
    SELECT decided_at, decided_by_user_id, 'participant_admitted', 'auction_participant', id, a, '{}'::jsonb
    FROM auction_participant WHERE auction_id = a AND status = 'admitted';
    INSERT INTO notification (user_id, type, auction_id, data, created_at) VALUES
        (u_diego, 'participant_admitted', a, '{"title": "[DEMO] Resmas de papel A4"}', v_now - interval '90 minutes');

    -- ---------------------------------------------------------------- moderación
    -- Denuncia abierta (aparece en la cola del moderador).
    INSERT INTO report (reporter_user_id, target_type, target_id, reason, detail)
    SELECT u_fer, 'auction', au.id, 'misleading', 'La descripción no menciona el estado de la batería.'
    FROM auction au JOIN listing li ON li.id = au.listing_id WHERE li.title = '[DEMO] Laptop ThinkPad T14';
    INSERT INTO audit_event (actor_user_id, action, entity_type, entity_id, data)
    SELECT u_fer, 'report_created', 'report', id, '{}'::jsonb FROM report WHERE reporter_user_id = u_fer;

    RAISE NOTICE 'Datos [DEMO] creados: 7 usuarios, 4 organizaciones, 9 subastas.';
END
$$;
