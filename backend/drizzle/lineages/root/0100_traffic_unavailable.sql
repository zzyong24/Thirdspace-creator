ALTER TABLE publication_traffic DROP CONSTRAINT IF EXISTS publication_traffic_status;
--> statement-breakpoint
ALTER TABLE publication_traffic ADD CONSTRAINT publication_traffic_status
 CHECK (status IN ('pending','succeeded','failed','needs_reconnect','unavailable'));
