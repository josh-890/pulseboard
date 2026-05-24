# Migration recipes

One-off SQL scripts kept around as patterns or as recovery recipes for migrations that needed manual intervention on a specific tenant.

These are **not** Prisma migrations — they are not picked up by `prisma migrate deploy`. They live here so the pattern is preserved and discoverable for future debugging.

## Recipes

### `slice-3a-portable.sql`

**Why it exists.** The Phase G Slice 3a migration (`prisma/migrations/20260524020000_migrate_eye_color_and_height_to_catalog`) hardcoded dev's `PhysicalAttributeGroup` UUIDs for `Eye Features` and `Core Body Measurements`. Prod tenants had different UUIDs for those groups (catalog was bootstrapped per-tenant via the manager UI rather than via a seed migration), so the INSERT failed on prod with the typical "transaction was aborted" error.

This recipe is the same migration with **name-based group lookup** (`SELECT id FROM "PhysicalAttributeGroup" WHERE name = '…'`), wrapped in `ON CONFLICT DO NOTHING` so it's idempotent on tenants that already have the data.

**When to use it.** When provisioning a fresh tenant that was created independently (its catalog group IDs don't match dev's). After running it on the new tenant, mark the original Prisma migration as applied so subsequent deploys don't re-attempt:

```sh
psql "$TENANT_URL" -f docs/migration-recipes/slice-3a-portable.sql
DATABASE_URL="$TENANT_URL" npx prisma migrate resolve --applied 20260524020000_migrate_eye_color_and_height_to_catalog
```

## Pattern guidance for future migrations

When seeding catalog entries from a Prisma migration, **never hardcode `PhysicalAttributeGroup` IDs** — they vary per tenant. Use a name-based subquery (`SELECT id FROM "PhysicalAttributeGroup" WHERE name = '…'`) and pair it with `ON CONFLICT (id) DO NOTHING` for idempotency.
