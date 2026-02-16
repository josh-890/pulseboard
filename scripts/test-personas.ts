/**
 * Quick manual test script for persona chain services.
 * Run with: npx tsx scripts/test-personas.ts
 */
import "dotenv/config";
import {
  getPersonaChain,
  getCurrentPersonState,
  getPersonaTimeline,
  createPersona,
  findPeopleByTrait,
  findPeopleByTraitCategory,
} from "../src/lib/services/persona-service";
import {
  getTraitCategories,
  getTraitCategoryById,
} from "../src/lib/services/trait-category-service";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function main() {
  console.log("=== Trait Category Service ===\n");

  const categories = await getTraitCategories();
  check("getTraitCategories returns 6", categories.length === 6);
  check(
    "Categories include Skill",
    categories.some((c) => c.name === "Skill"),
  );

  const skillCat = await getTraitCategoryById("tc-skill");
  check("getTraitCategoryById works", skillCat !== null);
  check("Skill category has icon", skillCat?.icon === "zap");

  console.log("\n=== Persona Chain (Sarah Chen — 3 personas) ===\n");

  const sarahChain = await getPersonaChain("p1");
  check("getPersonaChain returns 3 personas", sarahChain.length === 3);
  check("Ordered by sequenceNum", sarahChain[0].sequenceNum === 0);
  check("Seq 0 has 5 traits", sarahChain[0].traits.length === 5);
  check("Seq 1 has 3 traits", sarahChain[1].traits.length === 3);
  check("Seq 2 has 2 traits", sarahChain[2].traits.length === 2);

  console.log("\n=== Chain Collapse (Sarah Chen) ===\n");

  const sarahState = await getCurrentPersonState("p1");
  check("getCurrentPersonState returns non-null", sarahState !== null);
  if (sarahState) {
    check(
      "Job title collapsed to Senior Frontend Developer",
      sarahState.jobTitle === "Senior Frontend Developer",
    );
    check(
      "Department collapsed to Engineering (Berlin)",
      sarahState.department === "Engineering (Berlin)",
    );
    check(
      "Phone collapsed to Berlin number",
      sarahState.phone === "+49-30-555-0101",
    );
    check(
      "Address set from seq 2",
      sarahState.address === "Friedrichstraße 42, 10117 Berlin",
    );
    check("personaCount is 3", sarahState.personaCount === 3);
    check("Has 9 active traits", sarahState.traits.length === 9, `got ${sarahState.traits.length}`);

    // TypeScript proficiency was overwritten from intermediate → expert in seq 1
    const tsSkill = sarahState.traits.find((t) => t.name === "TypeScript");
    check(
      "TypeScript proficiency upgraded to expert",
      (tsSkill?.metadata as Record<string, unknown>)?.proficiency === "expert",
    );
  }

  console.log("\n=== Timeline (Sarah Chen) ===\n");

  const timeline = await getPersonaTimeline("p1");
  check("Timeline has 3 entries", timeline.length === 3);
  check("Entry 0 has 3 scalar changes (jobTitle, dept, phone)", timeline[0].scalarChanges.length === 3);
  check("Entry 1 has 1 scalar change (jobTitle)", timeline[1].scalarChanges.length === 1);
  check(
    "Entry 2 has 3 scalar changes (dept, address, phone)",
    timeline[2].scalarChanges.length === 3,
  );

  console.log("\n=== Minimal Case (Aisha Patel — 1 persona) ===\n");

  const aishaState = await getCurrentPersonState("p3");
  check("Aisha state exists", aishaState !== null);
  if (aishaState) {
    check("Aisha has 1 persona", aishaState.personaCount === 1);
    check("Aisha has 4 traits", aishaState.traits.length === 4, `got ${aishaState.traits.length}`);
    check("Aisha job is UX Designer", aishaState.jobTitle === "UX Designer");
  }

  console.log("\n=== Cross-Person Queries ===\n");

  const reactPeople = await findPeopleByTrait("tc-skill", "React");
  check(
    "findPeopleByTrait(React) finds Sarah",
    reactPeople.some((r) => r.personId === "p1"),
  );

  const skillPeople = await findPeopleByTraitCategory("tc-skill");
  check("findPeopleByTraitCategory(Skill) finds multiple people", skillPeople.length >= 3);

  console.log("\n=== createPersona (new persona for Aisha) ===\n");

  const newPersona = await createPersona({
    personId: "p3",
    effectiveDate: new Date(),
    note: "Test: promotion and new skill",
    jobTitle: "Senior UX Designer",
    traits: [
      {
        traitCategoryId: "tc-skill",
        name: "Prototyping",
        action: "add",
        metadata: { proficiency: "advanced" },
      },
    ],
  });
  check("New persona created", newPersona !== null);
  check("Auto-assigned sequenceNum 1", newPersona.sequenceNum === 1);

  const aishaUpdated = await getCurrentPersonState("p3");
  if (aishaUpdated) {
    check(
      "Aisha now has 2 personas",
      aishaUpdated.personaCount === 2,
    );
    check(
      "Aisha job collapsed to Senior UX Designer",
      aishaUpdated.jobTitle === "Senior UX Designer",
    );
    check(
      "Aisha now has 5 traits",
      aishaUpdated.traits.length === 5,
      `got ${aishaUpdated.traits.length}`,
    );
  }

  console.log("\n=== Nonexistent Person ===\n");

  const nobody = await getCurrentPersonState("nonexistent");
  check("Nonexistent person returns null", nobody === null);

  const emptyChain = await getPersonaChain("nonexistent");
  check("Nonexistent chain returns empty array", emptyChain.length === 0);

  // Summary
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
