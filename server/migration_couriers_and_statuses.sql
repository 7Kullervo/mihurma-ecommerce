-- Migration: courier assignment + new order status set + push notification support
-- Run this ONCE against your EXISTING mihurma database (don't re-run schema.sql,
-- that would wipe your products/orders). From the server folder:
--   mysql -u root -p -h 127.0.0.1 mihurma < migration_couriers_and_statuses.sql

USE mihurma;

CREATE TABLE IF NOT EXISTS couriers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(40),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

ALTER TABLE orders ADD COLUMN courier_id INT NULL AFTER shipping_phone;
ALTER TABLE orders ADD CONSTRAINT fk_orders_courier FOREIGN KEY (courier_id) REFERENCES couriers(id) ON DELETE SET NULL;

-- Step 1: widen the enum so it accepts BOTH old and new status values at once
-- (MySQL enums reject any value not already in the list, so we can't jump straight
-- to the new list while old rows still hold old values).
ALTER TABLE orders MODIFY status ENUM(
  'pending_payment','processing','shipped','out_for_delivery','delivered','cancelled',
  'preparing','prepared','on_the_way','arriving_today'
) NOT NULL DEFAULT 'pending_payment';

-- Step 2: remap every existing order to its new equivalent status
UPDATE orders SET status = 'preparing'       WHERE status = 'processing';
UPDATE orders SET status = 'on_the_way'      WHERE status = 'shipped';
UPDATE orders SET status = 'arriving_today'  WHERE status = 'out_for_delivery';

-- Step 3: now that no row uses an old value, narrow the enum down to the final list
ALTER TABLE orders MODIFY status ENUM(
  'pending_payment','preparing','prepared','on_the_way','arriving_today','delivered','cancelled'
) NOT NULL DEFAULT 'pending_payment';

ALTER TABLE users ADD COLUMN push_token VARCHAR(255) NULL;
