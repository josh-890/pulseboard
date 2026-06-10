-- Default scrape-source registry (subsumes the old hardcoded DOMAIN_TO_PLATFORM).
-- Idempotent: keyed on the unique platform key. Only THENUDE is scannable by
-- default — its scraper emits ICG-ID-bearing import files from a bare-URL list.
-- The others are reference-only until a scraper exists; they default to ICGID_URL
-- so flipping isScannable in settings is enough to attribute non-THENUDE scrapes.
INSERT INTO "ScrapeSource" ("id", "key", "displayName", "domains", "isScannable", "fileName", "lineFormat", "urlPattern", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('scrapesrc_thenude',   'THENUDE',   'TheNude',   ARRAY['thenude.com'],   true,  'thenude.txt',   'URL_ONLY',  NULL, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('scrapesrc_indexxx',   'Indexxx',   'Indexxx',   ARRAY['indexxx.com'],   false, 'indexxx.txt',   'ICGID_URL', NULL, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('scrapesrc_freeones',  'FreeOnes',  'FreeOnes',  ARRAY['freeones.com'],  false, 'freeones.txt',  'ICGID_URL', NULL, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('scrapesrc_babepedia', 'Babepedia', 'Babepedia', ARRAY['babepedia.com'], false, 'babepedia.txt', 'ICGID_URL', NULL, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('scrapesrc_iafd',      'IAFD',      'IAFD',      ARRAY['iafd.com'],      false, 'iafd.txt',      'ICGID_URL', NULL, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('scrapesrc_boobpedia', 'Boobpedia', 'Boobpedia', ARRAY['boobpedia.com'], false, 'boobpedia.txt', 'ICGID_URL', NULL, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('scrapesrc_egafd',     'EGAFD',     'EGAFD',     ARRAY['egafd.com'],     false, 'egafd.txt',     'ICGID_URL', NULL, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
