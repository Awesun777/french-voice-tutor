-- Applied manually via mysql2 (drizzle migrate is broken in this repo).
-- Journal entries for the admin Writing tab.
CREATE TABLE IF NOT EXISTS writing_entries (
  id        INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId    INT NOT NULL,
  title     VARCHAR(256) NOT NULL DEFAULT '',
  body      MEDIUMTEXT NOT NULL,
  createdAt BIGINT NOT NULL,
  updatedAt BIGINT NOT NULL,
  INDEX idx_writing_user (userId)
);
