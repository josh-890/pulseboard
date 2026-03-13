import { existsSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { COUNTRIES } from "../src/lib/constants/countries";

const FLAGS_DIR = path.join(process.cwd(), "public", "flags");
const CDN_BASE = "https://hatscripts.github.io/circle-flags/flags";

async function main() {
  await mkdir(FLAGS_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const country of COUNTRIES) {
    const code = country.code.toLowerCase();
    const localPath = path.join(FLAGS_DIR, `${code}.svg`);

    if (existsSync(localPath)) {
      skipped++;
      continue;
    }

    try {
      const res = await fetch(`${CDN_BASE}/${code}.svg`);
      if (!res.ok) {
        console.error(`  FAIL: ${country.code} (${country.name}) — HTTP ${res.status}`);
        failed++;
        continue;
      }
      const svg = await res.arrayBuffer();
      await writeFile(localPath, Buffer.from(svg));
      downloaded++;
      process.stdout.write(`  ${country.code}`);
    } catch (err) {
      console.error(`  FAIL: ${country.code} (${country.name}) — ${err}`);
      failed++;
    }
  }

  console.log(`\n\nDone: ${downloaded} downloaded, ${skipped} already cached, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
