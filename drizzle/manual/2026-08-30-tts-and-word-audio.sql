-- Applied manually via mysql2 (drizzle migrate is broken in this repo).
-- tts_cache: persistent synthesis cache (see server/tts.ts).
-- word_audio: Lingua Libre native recordings + cached misses (see server/commonsAudio.ts).
-- audio_b64 is MEDIUMTEXT: plain TEXT caps at 64KB, too small for sentence audio.
-- word_audio.term_key uses utf8mb4_bin like dict_cache (accent-exact keys; la/là bug).

CREATE TABLE IF NOT EXISTS tts_cache (
  text_hash  VARCHAR(64) NOT NULL PRIMARY KEY,
  text       VARCHAR(600) NOT NULL,
  engine     VARCHAR(32) NOT NULL,
  audio_b64  MEDIUMTEXT NOT NULL,
  mime_type  VARCHAR(64) NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_audio (
  term_key    VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  status      ENUM('found','none') NOT NULL,
  audio_b64   MEDIUMTEXT NULL,
  mime_type   VARCHAR(64) NULL,
  speaker     VARCHAR(128) NULL,
  source_file VARCHAR(512) NULL,
  created_at  BIGINT NOT NULL
);
