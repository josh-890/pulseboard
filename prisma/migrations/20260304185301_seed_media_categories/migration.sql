-- Seed default category groups and categories

-- Group 1: Physical Features
INSERT INTO "MediaCategoryGroup" ("id", "name", "sortOrder") VALUES
  ('grp_physical', 'Physical Features', 1);

INSERT INTO "MediaCategory" ("id", "groupId", "name", "slug", "sortOrder") VALUES
  ('cat_eyes',         'grp_physical', 'Eyes',         'eyes',         1),
  ('cat_nose',         'grp_physical', 'Nose',         'nose',         2),
  ('cat_lips',         'grp_physical', 'Lips',         'lips',         3),
  ('cat_ears',         'grp_physical', 'Ears',         'ears',         4),
  ('cat_teeth',        'grp_physical', 'Teeth',        'teeth',        5),
  ('cat_hands',        'grp_physical', 'Hands',        'hands',        6),
  ('cat_feet',         'grp_physical', 'Feet',         'feet',         7),
  ('cat_belly_button', 'grp_physical', 'Belly Button', 'belly-button', 8);

-- Group 2: Body Marks (linked to BodyMark entity)
INSERT INTO "MediaCategoryGroup" ("id", "name", "sortOrder") VALUES
  ('grp_body_marks', 'Body Marks', 2);

INSERT INTO "MediaCategory" ("id", "groupId", "name", "slug", "entityModel", "sortOrder") VALUES
  ('cat_tattoos',    'grp_body_marks', 'Tattoos',    'tattoos',    'BodyMark', 1),
  ('cat_scars',      'grp_body_marks', 'Scars',      'scars',      'BodyMark', 2),
  ('cat_birthmarks', 'grp_body_marks', 'Birthmarks', 'birthmarks', 'BodyMark', 3);

-- Group 3: Body Modifications (linked to BodyModification entity)
INSERT INTO "MediaCategoryGroup" ("id", "name", "sortOrder") VALUES
  ('grp_body_mods', 'Body Modifications', 3);

INSERT INTO "MediaCategory" ("id", "groupId", "name", "slug", "entityModel", "sortOrder") VALUES
  ('cat_piercings', 'grp_body_mods', 'Piercings', 'piercings', 'BodyModification', 1),
  ('cat_implants',  'grp_body_mods', 'Implants',  'implants',  'BodyModification', 2),
  ('cat_brandings', 'grp_body_mods', 'Brandings', 'brandings', 'BodyModification', 3);

-- Group 4: Cosmetic Procedures (linked to CosmeticProcedure entity)
INSERT INTO "MediaCategoryGroup" ("id", "name", "sortOrder") VALUES
  ('grp_cosmetic', 'Cosmetic Procedures', 4);

INSERT INTO "MediaCategory" ("id", "groupId", "name", "slug", "entityModel", "sortOrder") VALUES
  ('cat_breast',      'grp_cosmetic', 'Breast',      'breast',      'CosmeticProcedure', 1),
  ('cat_rhinoplasty', 'grp_cosmetic', 'Rhinoplasty', 'rhinoplasty', 'CosmeticProcedure', 2),
  ('cat_lip_fillers', 'grp_cosmetic', 'Lip Fillers', 'lip-fillers', 'CosmeticProcedure', 3);

-- Migrate existing BODY_MARK / BODY_MODIFICATION / COSMETIC_PROCEDURE links to DETAIL

-- BODY_MARK → DETAIL + tattoos as default category
UPDATE "PersonMediaLink"
  SET "usage" = 'DETAIL', "categoryId" = 'cat_tattoos'
  WHERE "usage" = 'BODY_MARK';

-- BODY_MODIFICATION → DETAIL + piercings as default
UPDATE "PersonMediaLink"
  SET "usage" = 'DETAIL', "categoryId" = 'cat_piercings'
  WHERE "usage" = 'BODY_MODIFICATION';

-- COSMETIC_PROCEDURE → DETAIL + breast as default
UPDATE "PersonMediaLink"
  SET "usage" = 'DETAIL', "categoryId" = 'cat_breast'
  WHERE "usage" = 'COSMETIC_PROCEDURE';
