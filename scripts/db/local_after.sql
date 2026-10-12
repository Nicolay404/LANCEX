-- Solo PostgreSQL local/CI: contraseña conocida para que las pruebas se conecten como lancex_app
-- (el mismo rol sin DDL que usa Django contra Supabase). NUNCA contra el proyecto compartido.
ALTER ROLE lancex_app WITH PASSWORD 'lancex_app';
