-- Each receiver belongs to a send block so a large list can be watched chunk by chunk.
ALTER TABLE `campaign_recipients`
    ADD COLUMN `chunk_index` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    ADD INDEX `idx_campaign_chunk`(`campaign_id`, `chunk_index`);

UPDATE `campaign_recipients` AS r
INNER JOIN (
    SELECT id, CAST(CEIL(ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY id) / 200) AS UNSIGNED) AS chunk_index
    FROM `campaign_recipients`
) AS ranked ON ranked.id = r.id
SET r.chunk_index = ranked.chunk_index;
