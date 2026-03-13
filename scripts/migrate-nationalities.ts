import "dotenv/config";
import pg from "pg";
import { resolveNationalityToCode, findCountryByCode } from "../src/lib/constants/countries";

const apply = process.argv.includes("--apply");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query<{ nationality: string; cnt: string }>(
      `SELECT nationality, COUNT(*)::text as cnt FROM "Person" WHERE nationality IS NOT NULL AND nationality != '' GROUP BY nationality ORDER BY nationality`,
    );

    if (rows.length === 0) {
      console.log("No nationality values found.");
      return;
    }

    console.log("\n=== Nationality Migration Plan ===\n");
    console.log("Current Value".padEnd(25), "→", "ISO Code".padEnd(8), "Country Name".padEnd(30), "Count");
    console.log("-".repeat(80));

    const mappings: { from: string; to: string | null; count: number }[] = [];
    let unmapped = 0;

    for (const row of rows) {
      const resolved = resolveNationalityToCode(row.nationality);
      const country = resolved ? findCountryByCode(resolved) : null;
      const count = parseInt(row.cnt, 10);
      mappings.push({ from: row.nationality, to: resolved, count });

      if (resolved) {
        console.log(
          row.nationality.padEnd(25),
          "→",
          resolved.padEnd(8),
          (country?.name ?? "?").padEnd(30),
          count,
        );
      } else {
        console.log(
          row.nationality.padEnd(25),
          "→",
          "???".padEnd(8),
          "UNRESOLVED".padEnd(30),
          count,
        );
        unmapped++;
      }
    }

    console.log("\n" + "-".repeat(80));
    console.log(`Total: ${rows.length} distinct values, ${unmapped} unresolved`);

    if (!apply) {
      console.log("\nDry run complete. Use --apply to execute migration.");
      return;
    }

    if (unmapped > 0) {
      console.log("\nWARNING: Skipping unresolved values. Fix them manually.");
    }

    console.log("\nApplying migration...");
    let updated = 0;

    for (const mapping of mappings) {
      if (!mapping.to) continue;
      if (mapping.from === mapping.to) continue; // Already correct

      const result = await client.query(
        `UPDATE "Person" SET nationality = $1 WHERE nationality = $2`,
        [mapping.to, mapping.from],
      );
      updated += result.rowCount ?? 0;
      console.log(`  ${mapping.from} → ${mapping.to}: ${result.rowCount} rows`);
    }

    console.log(`\nDone. Updated ${updated} rows.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
