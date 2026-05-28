-- Add sort_order column to libraries for custom ordering.
ALTER TABLE libraries ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
