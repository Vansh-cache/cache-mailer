-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `hidden` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `send_format` ENUM('html', 'plain') NOT NULL DEFAULT 'html';

-- AlterTable
ALTER TABLE `contacts` ADD COLUMN `bonus_score` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `referral_code` VARCHAR(16) NULL,
    ADD COLUMN `referred_by_id` BIGINT UNSIGNED NULL,
    ADD COLUMN `score` INTEGER UNSIGNED NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `sender_accounts` MODIFY `provider` ENUM('graph', 'ses', 'smtp') NOT NULL DEFAULT 'graph';

-- AlterTable
ALTER TABLE `tags` ADD COLUMN `points` SMALLINT UNSIGNED NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `sequences` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `team_id` TINYINT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `trigger_tag_id` INTEGER UNSIGNED NOT NULL,
    `sender_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('active', 'paused') NOT NULL DEFAULT 'active',
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_sequence_trigger`(`status`, `trigger_tag_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sequence_steps` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `sequence_id` INTEGER UNSIGNED NOT NULL,
    `position` TINYINT UNSIGNED NOT NULL,
    `wait_days` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `subject` VARCHAR(255) NOT NULL,
    `template_id` BIGINT UNSIGNED NOT NULL,
    `campaign_id` BIGINT UNSIGNED NULL,

    UNIQUE INDEX `sequence_steps_campaign_id_key`(`campaign_id`),
    UNIQUE INDEX `uq_sequence_step`(`sequence_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sequence_enrollments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sequence_id` INTEGER UNSIGNED NOT NULL,
    `contact_id` BIGINT UNSIGNED NOT NULL,
    `next_step` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `next_run_at` DATETIME(0) NOT NULL,
    `status` ENUM('active', 'done', 'stopped') NOT NULL DEFAULT 'active',

    INDEX `idx_enrollment_due`(`status`, `next_run_at`),
    UNIQUE INDEX `uq_sequence_contact`(`sequence_id`, `contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gates` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `team_id` TINYINT UNSIGNED NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `detail` VARCHAR(500) NOT NULL,
    `tag_name` VARCHAR(80) NOT NULL,
    `asset_url` VARCHAR(2000) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `gates_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `contacts_referral_code_key` ON `contacts`(`referral_code`);

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_referred_by_id_fkey` FOREIGN KEY (`referred_by_id`) REFERENCES `contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequences` ADD CONSTRAINT `sequences_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequences` ADD CONSTRAINT `sequences_trigger_tag_id_fkey` FOREIGN KEY (`trigger_tag_id`) REFERENCES `tags`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequences` ADD CONSTRAINT `sequences_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `sender_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequences` ADD CONSTRAINT `sequences_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequence_steps` ADD CONSTRAINT `sequence_steps_sequence_id_fkey` FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequence_steps` ADD CONSTRAINT `sequence_steps_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequence_steps` ADD CONSTRAINT `sequence_steps_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequence_enrollments` ADD CONSTRAINT `sequence_enrollments_sequence_id_fkey` FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequence_enrollments` ADD CONSTRAINT `sequence_enrollments_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gates` ADD CONSTRAINT `gates_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

