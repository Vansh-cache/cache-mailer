-- CreateTable
CREATE TABLE `teams` (
    `id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `teams_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'marketing', 'sales') NOT NULL,
    `team_id` TINYINT UNSIGNED NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sender_accounts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `team_id` TINYINT UNSIGNED NOT NULL,
    `from_name` VARCHAR(100) NOT NULL,
    `from_email` VARCHAR(190) NOT NULL,
    `reply_to` VARCHAR(190) NULL,
    `provider` ENUM('graph', 'ses') NOT NULL DEFAULT 'graph',
    `daily_limit` INTEGER UNSIGNED NOT NULL DEFAULT 500,
    `per_minute_limit` INTEGER UNSIGNED NOT NULL DEFAULT 20,
    `status` ENUM('active', 'paused', 'error') NOT NULL DEFAULT 'active',
    `last_error` TEXT NULL,
    `inbox_delta_link` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sender_accounts_from_email_key`(`from_email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(190) NOT NULL,
    `first_name` VARCHAR(100) NULL,
    `last_name` VARCHAR(100) NULL,
    `company` VARCHAR(190) NULL,
    `job_title` VARCHAR(150) NULL,
    `status` ENUM('active', 'unsubscribed', 'bounced') NOT NULL DEFAULT 'active',
    `source` VARCHAR(50) NULL,
    `consent_note` VARCHAR(255) NULL,
    `zoho_id` VARCHAR(40) NULL,
    `zoho_module` ENUM('contacts', 'leads') NULL,
    `custom_fields` JSON NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `contacts_email_key`(`email`),
    INDEX `idx_status`(`status`),
    INDEX `idx_zoho`(`zoho_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,

    UNIQUE INDEX `tags_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_tags` (
    `contact_id` BIGINT UNSIGNED NOT NULL,
    `tag_id` INTEGER UNSIGNED NOT NULL,

    INDEX `idx_tag`(`tag_id`),
    PRIMARY KEY (`contact_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `segments` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `team_id` TINYINT UNSIGNED NULL,
    `name` VARCHAR(120) NOT NULL,
    `rules` JSON NOT NULL,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `file_name` VARCHAR(190) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `size_bytes` INTEGER UNSIGNED NOT NULL,
    `uploaded_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `templates` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `team_id` TINYINT UNSIGNED NULL,
    `name` VARCHAR(150) NOT NULL,
    `kind` ENUM('draft', 'template') NOT NULL DEFAULT 'template',
    `visibility` ENUM('team', 'shared') NOT NULL DEFAULT 'team',
    `design_json` JSON NOT NULL,
    `html` MEDIUMTEXT NULL,
    `text_version` MEDIUMTEXT NULL,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `team_id` TINYINT UNSIGNED NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `preheader` VARCHAR(255) NULL,
    `template_id` BIGINT UNSIGNED NOT NULL,
    `html_snapshot` MEDIUMTEXT NULL,
    `text_snapshot` MEDIUMTEXT NULL,
    `audience` JSON NOT NULL,
    `use_utm` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed') NOT NULL DEFAULT 'draft',
    `scheduled_at` DATETIME(0) NULL,
    `started_at` DATETIME(0) NULL,
    `finished_at` DATETIME(0) NULL,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_status_sched`(`status`, `scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_senders` (
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `sender_id` BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (`campaign_id`, `sender_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_recipients` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `contact_id` BIGINT UNSIGNED NOT NULL,
    `sender_id` BIGINT UNSIGNED NOT NULL,
    `token` CHAR(32) NOT NULL,
    `status` ENUM('queued', 'processing', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'queued',
    `skip_reason` VARCHAR(50) NULL,
    `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `locked_by` VARCHAR(40) NULL,
    `locked_until` DATETIME(0) NULL,
    `internet_message_id` VARCHAR(255) NULL,
    `last_error` VARCHAR(500) NULL,
    `sent_at` DATETIME(0) NULL,

    UNIQUE INDEX `campaign_recipients_token_key`(`token`),
    INDEX `idx_queue`(`status`, `sender_id`, `next_attempt_at`),
    INDEX `idx_campaign_status`(`campaign_id`, `status`),
    INDEX `idx_msgid`(`internet_message_id`),
    UNIQUE INDEX `uq_campaign_contact`(`campaign_id`, `contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `links` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `original_url` VARCHAR(2000) NOT NULL,
    `url_hash` CHAR(40) NOT NULL,

    UNIQUE INDEX `uq_campaign_link`(`campaign_id`, `url_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `recipient_id` BIGINT UNSIGNED NOT NULL,
    `type` ENUM('delivered', 'bounce_hard', 'bounce_soft', 'open', 'click', 'unsubscribe', 'reply') NOT NULL,
    `link_id` BIGINT UNSIGNED NULL,
    `is_bot` BOOLEAN NOT NULL DEFAULT false,
    `user_agent` VARCHAR(300) NULL,
    `ip_hash` CHAR(64) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_campaign_type_time`(`campaign_id`, `type`, `created_at`),
    INDEX `idx_recipient`(`recipient_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_stats` (
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `total_recipients` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `sent` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `failed` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `bounced_hard` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `bounced_soft` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `unique_opens` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_opens` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `unique_clicks` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_clicks` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `unsubscribes` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `replies` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `updated_at` DATETIME(0) NOT NULL,

    PRIMARY KEY (`campaign_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_stats_hourly` (
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `hour_start` DATETIME(0) NOT NULL,
    `opens` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `clicks` INTEGER UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (`campaign_id`, `hour_start`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppression_list` (
    `email` VARCHAR(190) NOT NULL,
    `reason` ENUM('unsubscribed', 'hard_bounce', 'manual', 'zoho_optout') NOT NULL,
    `campaign_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zoho_sync_state` (
    `module` ENUM('contacts', 'leads') NOT NULL,
    `last_modified_time` DATETIME(0) NULL,
    `last_run_at` DATETIME(0) NULL,
    `last_status` VARCHAR(50) NULL,
    `last_error` TEXT NULL,

    PRIMARY KEY (`module`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_secrets` (
    `name` VARCHAR(60) NOT NULL,
    `value_encrypted` LONGBLOB NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `k` VARCHAR(60) NOT NULL,
    `v` TEXT NOT NULL,

    PRIMARY KEY (`k`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity` VARCHAR(50) NULL,
    `entity_id` BIGINT UNSIGNED NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_audit_action`(`action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sender_accounts` ADD CONSTRAINT `sender_accounts_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_tags` ADD CONSTRAINT `contact_tags_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_tags` ADD CONSTRAINT `contact_tags_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `segments` ADD CONSTRAINT `segments_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `segments` ADD CONSTRAINT `segments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `templates` ADD CONSTRAINT `templates_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `templates` ADD CONSTRAINT `templates_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_senders` ADD CONSTRAINT `campaign_senders_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_senders` ADD CONSTRAINT `campaign_senders_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `sender_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `sender_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `links` ADD CONSTRAINT `links_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_recipient_id_fkey` FOREIGN KEY (`recipient_id`) REFERENCES `campaign_recipients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_link_id_fkey` FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_stats` ADD CONSTRAINT `campaign_stats_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_stats_hourly` ADD CONSTRAINT `campaign_stats_hourly_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
