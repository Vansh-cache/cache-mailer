-- Each SMTP mailbox keeps its own server settings. The password stays in integration_secrets.
ALTER TABLE `sender_accounts`
    ADD COLUMN `smtp_host` VARCHAR(255) NULL,
    ADD COLUMN `smtp_port` SMALLINT UNSIGNED NULL,
    ADD COLUMN `smtp_secure` BOOLEAN NOT NULL DEFAULT false;
