-- AlterTable
ALTER TABLE `assets` ADD COLUMN `mime_type` VARCHAR(40) NULL,
    ADD COLUMN `data` MEDIUMBLOB NULL;

-- CreateIndex
CREATE INDEX `assets_file_name_idx` ON `assets`(`file_name`);

-- CreateTable
CREATE TABLE `template_assets` (
    `template_id` BIGINT UNSIGNED NOT NULL,
    `asset_id` BIGINT UNSIGNED NOT NULL,

    INDEX `template_assets_asset_id_idx`(`asset_id`),
    PRIMARY KEY (`template_id`, `asset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `template_assets` ADD CONSTRAINT `template_assets_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_assets` ADD CONSTRAINT `template_assets_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
