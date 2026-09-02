-- Applied manually via mysql2 (drizzle migrate is broken in this repo).
-- voice_sessions.agent: which tutor ran the session ("romain"/"anna");
--   NULL = pre-tracking rows, counted as Romain in the admin breakdown.
-- content_views: one row per video/article open, deduped server-side to one
--   per (user, item) per 30 min. refKey = youtubeId or article slug.

ALTER TABLE voice_sessions ADD COLUMN agent VARCHAR(16) NULL;

CREATE TABLE IF NOT EXISTS content_views (
  id        INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId    INT NOT NULL,
  kind      ENUM('video','article') NOT NULL,
  refKey    VARCHAR(128) NOT NULL,
  createdAt BIGINT NOT NULL,
  INDEX idx_content_views_user (userId),
  INDEX idx_content_views_dedupe (userId, kind, refKey, createdAt)
);
