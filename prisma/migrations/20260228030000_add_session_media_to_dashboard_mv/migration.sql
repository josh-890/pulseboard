-- Recreate mv_dashboard_stats with sessionCount and mediaItemCount columns

DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_stats;

CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM "Person" WHERE "deletedAt" IS NULL) AS "personCount",
  (SELECT COUNT(*) FROM "Set" WHERE "deletedAt" IS NULL) AS "setCount",
  (SELECT COUNT(*) FROM "Label" WHERE "deletedAt" IS NULL) AS "labelCount",
  (SELECT COUNT(*) FROM "Channel" WHERE "deletedAt" IS NULL) AS "channelCount",
  (SELECT COUNT(*) FROM "Project" WHERE "deletedAt" IS NULL) AS "projectCount",
  (SELECT COUNT(*) FROM "MediaItem" WHERE "deletedAt" IS NULL) AS "mediaItemCount",
  (SELECT COUNT(*) FROM "Session" WHERE "deletedAt" IS NULL AND status != 'REFERENCE') AS "sessionCount";
