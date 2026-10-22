-- CreateTable
CREATE TABLE `user_senders` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `sender_id` BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (`user_id`, `sender_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_senders` ADD CONSTRAINT `user_senders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_senders` ADD CONSTRAINT `user_senders_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `sender_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
