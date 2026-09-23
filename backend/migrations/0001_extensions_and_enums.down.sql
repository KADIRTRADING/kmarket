DROP FUNCTION IF EXISTS set_updated_at();

DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS financial_entry_type;
DROP TYPE IF EXISTS inventory_count_status;
DROP TYPE IF EXISTS purchase_order_status;
DROP TYPE IF EXISTS transfer_status;
DROP TYPE IF EXISTS click_transaction_status;
DROP TYPE IF EXISTS payment_status;
DROP TYPE IF EXISTS sale_status;
DROP TYPE IF EXISTS payment_method;
DROP TYPE IF EXISTS movement_type;
DROP TYPE IF EXISTS app_language;
DROP TYPE IF EXISTS store_role;
DROP TYPE IF EXISTS store_status;
DROP TYPE IF EXISTS platform_role;

DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS pgcrypto;
