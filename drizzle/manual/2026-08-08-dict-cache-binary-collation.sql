-- Applied to production 2026-08-08 (manually, via railway run).
--
-- dict_cache.term_key was created under the database default collation,
-- utf8mb4_0900_ai_ci — accent-insensitive — so 'v2::la' and 'v2::là' were THE
-- SAME primary key. Every accent-variant pair (la/là, ou/où, sur/sûr, du/dû,
-- passe/passé, coeur/cœur…) collapsed into one row: the second write's
-- onDuplicateKeyUpdate overwrote the first entry, and lookups for either
-- variant served whichever entry survived — a user searching « là » (there)
-- could receive the entry for « la » (the article).
--
-- Surfaced by the 2026-08-07 precompute batch: 5,953 entries generated but
-- only 5,737 distinct rows landed; the 263-word gap was exactly the accent
-- pairs. Fix: binary collation (keys are lowercased in JS already, so
-- case-sensitivity is moot), purge the ambiguous rows, regenerate.
ALTER TABLE dict_cache
  MODIFY term_key VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
