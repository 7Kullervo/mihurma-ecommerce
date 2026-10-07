-- Migration: adds a tracking_number field to orders, for the courier/postal tracking
-- number admins hand out once a package has shipped (e.g. a Pakistan Post / EMS number
-- trackable at https://ep.gov.pk/).
-- Run this ONCE against your EXISTING mihurma database:
--   mysql -u root -p -h 127.0.0.1 mihurma < migration_tracking_number.sql

USE mihurma;

ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(100) NULL AFTER courier_id;
