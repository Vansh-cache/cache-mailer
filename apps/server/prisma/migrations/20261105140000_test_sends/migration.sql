-- One row per mailbox and receiver for every template test send.
CREATE TABLE `test_sends` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `template_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NULL,
    `to_email` VARCHAR(190) NOT NULL,
    `from_email` VARCHAR(190) NOT NULL,
    `status` ENUM('sent', 'failed') NOT NULL,
    `error` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_test_sends_created`(`created_at`),
    INDEX `idx_test_sends_template`(`template_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `test_sends` ADD CONSTRAINT `test_sends_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Older test sends were stored as one audit row after the whole batch succeeded.
INSERT INTO `test_sends` (`template_id`, `user_id`, `to_email`, `from_email`, `status`, `created_at`)
SELECT
    expanded.template_id,
    expanded.user_id,
    expanded.to_email,
    expanded.from_email,
    'sent',
    expanded.created_at
FROM (
    SELECT
        a.entity_id AS template_id,
        a.user_id AS user_id,
        TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(JSON_UNQUOTE(JSON_EXTRACT(a.meta, '$.to')), ',', nums.n), ',', -1)) AS to_email,
        CASE
            WHEN JSON_EXTRACT(a.meta, CONCAT('$.mailboxes[', boxes.n - 1, ']')) IS NULL THEN ''
            ELSE JSON_UNQUOTE(JSON_EXTRACT(a.meta, CONCAT('$.mailboxes[', boxes.n - 1, ']')))
        END AS from_email,
        a.created_at AS created_at
    FROM `audit_log` a
    INNER JOIN (
        SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
        UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
    ) nums
    INNER JOIN (
        SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
        UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
        UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
        UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
    ) boxes
    WHERE a.action = 'template.test_send'
      AND a.entity_id IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(a.meta, '$.to')) IS NOT NULL
      AND nums.n <= 1 + CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(a.meta, '$.to'))) - CHAR_LENGTH(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(a.meta, '$.to')), ',', ''))
      AND (
          JSON_EXTRACT(a.meta, CONCAT('$.mailboxes[', boxes.n - 1, ']')) IS NOT NULL
          OR (boxes.n = 1 AND JSON_EXTRACT(a.meta, '$.mailboxes[0]') IS NULL)
      )
      AND EXISTS (SELECT 1 FROM `templates` t WHERE t.id = a.entity_id)
) expanded
WHERE expanded.to_email <> '';
