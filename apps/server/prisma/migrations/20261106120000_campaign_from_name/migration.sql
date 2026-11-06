-- The name receivers see can be chosen per send, instead of always using the mailbox name.
ALTER TABLE `campaigns`
    ADD COLUMN `from_name` VARCHAR(100) NULL;
