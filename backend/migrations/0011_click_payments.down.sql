ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS fk_sale_payments_click_transaction;
DROP TABLE IF EXISTS click_webhook_events;
DROP TABLE IF EXISTS click_transactions;
DROP TABLE IF EXISTS store_click_credentials;
