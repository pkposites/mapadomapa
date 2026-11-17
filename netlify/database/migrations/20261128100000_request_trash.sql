-- Soft delete keeps delivery history and original intake IDs for deduplication.
ALTER TABLE service_requests ADD COLUMN deleted_at timestamptz;
ALTER TABLE deforafora_intake ADD COLUMN deleted_at timestamptz;
