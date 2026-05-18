-- ─── Replace color_family_map + compute_*_family with color_catalog + lookup_* ─

-- 1. Drop the old family-only lookup table and its helper functions. These
--    were referenced by the previous mv_person_current_state computed columns
--    (hairColorFamily / eyeColorFamily). The MV is rebuilt in the next
--    migration (extend_person_search_mv_v2) — drop it here first so the
--    function-drop doesn't fail with a dependency error.
DROP MATERIALIZED VIEW IF EXISTS mv_person_current_state;

DROP FUNCTION IF EXISTS compute_hair_family(text);
DROP FUNCTION IF EXISTS compute_eye_family(text);
DROP FUNCTION IF EXISTS compute_skin_family(text);
DROP TABLE IF EXISTS color_family_map;

-- 2. New unified catalog: one row per canonical color value per category, with
--    two-axis classification (hue + shade for hair/eye; tone + undertone for
--    skin — same schema, category-aware interpretation).
CREATE TABLE color_catalog (
  category      TEXT      NOT NULL,
  value_norm    TEXT      NOT NULL,
  display       TEXT      NOT NULL,
  hue           TEXT      NOT NULL,
  shade         TEXT,
  shade_rank    INT,
  sort_order    INT       NOT NULL DEFAULT 0,
  needs_review  BOOLEAN   NOT NULL DEFAULT FALSE,
  source        TEXT      NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category, value_norm)
);

CREATE INDEX color_catalog_category_hue_idx        ON color_catalog (category, hue);
CREATE INDEX color_catalog_category_needs_review   ON color_catalog (category, needs_review);

-- 3. Lookup helpers. Schema-qualified table + explicit text cast on the input
--    avoid the inlining problems seen with the old compute_*_family functions
--    when used inside CREATE MATERIALIZED VIEW (see git log for details).

CREATE OR REPLACE FUNCTION lookup_hair_hue(v TEXT) RETURNS TEXT AS $$
  SELECT hue FROM public.color_catalog
  WHERE category = 'hair'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_hair_shade(v TEXT) RETURNS TEXT AS $$
  SELECT shade FROM public.color_catalog
  WHERE category = 'hair'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_hair_shade_rank(v TEXT) RETURNS INT AS $$
  SELECT shade_rank FROM public.color_catalog
  WHERE category = 'hair'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_eye_hue(v TEXT) RETURNS TEXT AS $$
  SELECT hue FROM public.color_catalog
  WHERE category = 'eye'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_eye_shade(v TEXT) RETURNS TEXT AS $$
  SELECT shade FROM public.color_catalog
  WHERE category = 'eye'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_eye_shade_rank(v TEXT) RETURNS INT AS $$
  SELECT shade_rank FROM public.color_catalog
  WHERE category = 'eye'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Skin uses the same schema with category-aware interpretation:
--   hue column         = tone (Fair / Light / ... / Ebony)
--   shade column       = undertone (Cool / Warm / Neutral)
--   shade_rank column  = tone ordinal (1=Fair, 6=Ebony)
CREATE OR REPLACE FUNCTION lookup_skin_tone(v TEXT) RETURNS TEXT AS $$
  SELECT hue FROM public.color_catalog
  WHERE category = 'skin'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_skin_tone_rank(v TEXT) RETURNS INT AS $$
  SELECT shade_rank FROM public.color_catalog
  WHERE category = 'skin'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_skin_undertone(v TEXT) RETURNS TEXT AS $$
  SELECT shade FROM public.color_catalog
  WHERE category = 'skin'
    AND value_norm = public.unaccent(lower(trim(coalesce(v, ''::text))))
  LIMIT 1;
$$ LANGUAGE SQL STABLE;
