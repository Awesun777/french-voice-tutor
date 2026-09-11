-- Applied manually via mysql2 (drizzle migrate is broken in this repo).
-- TV5MONDE / FEI TCF training booklets ingested by scripts/tcf_tv5_ingest.py
-- for the admin-only "TCF Blanc" tab. Media bytes live in the DB as base64
-- (same reasoning as tts_cache: the storage proxy's URLs expire).
CREATE TABLE IF NOT EXISTS tcf_tv5_series (
  series INT NOT NULL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  item_count INT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS tcf_tv5_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  series INT NOT NULL,
  n INT NOT NULL,
  section VARCHAR(16) NOT NULL,
  consigne TEXT NULL,
  question TEXT NULL,
  choices_json TEXT NOT NULL,
  spoken_choices TINYINT NOT NULL DEFAULT 0,
  answer CHAR(1) NOT NULL,
  doc_text TEXT NULL,
  image_b64 MEDIUMTEXT NULL,
  image_mime VARCHAR(32) NULL,
  audio_b64 MEDIUMTEXT NULL,
  audio_mime VARCHAR(32) NULL,
  audio_seconds FLOAT NULL,
  transcript TEXT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uq_tcf_tv5_series_n (series, n)
);
