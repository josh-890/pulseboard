-- Rebuild v_person_work_history to use production date (Session.date) instead of
-- Set.releaseDate for age calculation. Falls back to releaseDate when session date
-- is unknown. dateIsConfirmed=true → precision-based ~; false/fallback → always ~.

DROP VIEW IF EXISTS v_person_work_history;

CREATE VIEW v_person_work_history AS
SELECT
  sp."personId",
  s.id          AS "setId",
  s.title       AS "setTitle",
  s.type        AS "setType",
  crd.name      AS role,
  s."releaseDate",
  s."releaseDatePrecision",
  ch.name       AS "channelName",
  l.id          AS "labelId",
  l.name        AS "labelName",

  -- Production date: prefer confirmed session date, fallback to release date
  COALESCE(sess.date, s."releaseDate")                                      AS "productionDate",
  COALESCE(sess."datePrecision"::text, s."releaseDatePrecision"::text)      AS "productionDatePrecision",
  COALESCE(sess."dateIsConfirmed", false)                                   AS "dateIsConfirmed",

  -- Age at production with confirmation-aware ~ prefix
  CASE
    WHEN p.birthdate IS NULL THEN NULL
    WHEN sess."dateIsConfirmed" = true AND sess.date IS NOT NULL THEN
      compute_age_at(
        p.birthdate, p."birthdatePrecision"::text,
        sess.date,   sess."datePrecision"::text
      )
    WHEN sess.date IS NOT NULL THEN
      -- Unconfirmed session date → strip any existing ~ then always prepend ~
      '~' || LTRIM(
        COALESCE(compute_age_at(
          p.birthdate, p."birthdatePrecision"::text,
          sess.date,   sess."datePrecision"::text
        ), ''),
        '~'
      )
    WHEN s."releaseDate" IS NOT NULL THEN
      -- Release date fallback → always ~
      '~' || LTRIM(
        COALESCE(compute_age_at(
          p.birthdate,    p."birthdatePrecision"::text,
          s."releaseDate", s."releaseDatePrecision"::text
        ), ''),
        '~'
      )
    ELSE NULL
  END AS "ageAtProduction"

FROM "SetParticipant" sp
  JOIN "ContributionRoleDefinition" crd ON crd.id = sp."roleDefinitionId"
  JOIN "Set" s                          ON s.id   = sp."setId"
  JOIN "Person" p                       ON p.id   = sp."personId"
  -- Primary session for this set (may not exist)
  LEFT JOIN "SetSession" ss             ON ss."setId" = s.id AND ss."isPrimary" = true
  LEFT JOIN "Session" sess              ON sess.id = ss."sessionId"
  LEFT JOIN "Channel" ch                ON ch.id  = s."channelId"
  LEFT JOIN "ChannelLabelMap" clm       ON clm."channelId" = ch.id
  LEFT JOIN "Label" l                   ON l.id   = clm."labelId";
