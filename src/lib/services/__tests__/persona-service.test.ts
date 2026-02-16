import { describe, it, expect, beforeAll } from "vitest";
import {
  getPersonaChain,
  getCurrentPersonState,
  getPersonaTimeline,
  createPersona,
  findPeopleByTrait,
  findPeopleByTraitCategory,
} from "../persona-service";

/**
 * Integration tests for persona-service.
 * Requires seeded dev database (npx prisma db seed).
 */

describe("getPersonaChain", () => {
  it("returns 3 personas for Sarah Chen ordered by sequenceNum", async () => {
    const chain = await getPersonaChain("p1");
    expect(chain).toHaveLength(3);
    expect(chain[0].sequenceNum).toBe(0);
    expect(chain[1].sequenceNum).toBe(1);
    expect(chain[2].sequenceNum).toBe(2);
  });

  it("includes traits with traitCategory for each persona", async () => {
    const chain = await getPersonaChain("p1");
    expect(chain[0].traits.length).toBeGreaterThan(0);
    expect(chain[0].traits[0].traitCategory).toBeDefined();
    expect(chain[0].traits[0].traitCategory.name).toBeTruthy();
  });

  it("returns empty array for nonexistent person", async () => {
    const chain = await getPersonaChain("nonexistent");
    expect(chain).toEqual([]);
  });
});

describe("getCurrentPersonState", () => {
  it("returns null for nonexistent person", async () => {
    const state = await getCurrentPersonState("nonexistent");
    expect(state).toBeNull();
  });

  it("collapses Sarah Chen's 3 personas correctly", async () => {
    const state = await getCurrentPersonState("p1");
    expect(state).not.toBeNull();
    expect(state!.personId).toBe("p1");
    expect(state!.firstName).toBe("Sarah");
    expect(state!.lastName).toBe("Chen");
  });

  it("last-write-wins for scalar fields", async () => {
    const state = await getCurrentPersonState("p1");
    // seq 0: Frontend Developer → seq 1: Senior Frontend Developer
    expect(state!.jobTitle).toBe("Senior Frontend Developer");
    // seq 0: Engineering → seq 2: Engineering (Berlin)
    expect(state!.department).toBe("Engineering (Berlin)");
    // seq 0: +1-555-0101 → seq 2: +49-30-555-0101
    expect(state!.phone).toBe("+49-30-555-0101");
    // only set in seq 2
    expect(state!.address).toBe("Friedrichstraße 42, 10117 Berlin");
  });

  it("overwrites trait metadata when re-added", async () => {
    const state = await getCurrentPersonState("p1");
    // TypeScript was added at seq 0 (intermediate) then re-added at seq 1 (expert)
    const ts = state!.traits.find((t) => t.name === "TypeScript");
    expect(ts).toBeDefined();
    expect((ts!.metadata as Record<string, unknown>)?.proficiency).toBe(
      "expert",
    );
  });

  it("accumulates traits across personas", async () => {
    const state = await getCurrentPersonState("p1");
    // 5 from seq 0 + 3 from seq 1 + 2 from seq 2
    // But TypeScript is overwritten (not duplicated), so: 5 + 2 new + 2 new = 9
    expect(state!.traits).toHaveLength(9);
    const traitNames = state!.traits.map((t) => t.name).sort();
    expect(traitNames).toContain("React");
    expect(traitNames).toContain("Next.js");
    expect(traitNames).toContain("German");
    expect(traitNames).toContain("Dragon tattoo");
  });

  it("tracks persona count and latest date", async () => {
    const state = await getCurrentPersonState("p1");
    expect(state!.personaCount).toBe(3);
    expect(state!.latestPersonaDate).toBeInstanceOf(Date);
  });

  it("handles minimal case (single persona)", async () => {
    const state = await getCurrentPersonState("p3");
    expect(state!.personaCount).toBe(1);
    expect(state!.jobTitle).toBe("UX Designer");
    expect(state!.department).toBe("Design");
    expect(state!.traits).toHaveLength(4);
  });

  it("handles baseline-only personas (no traits)", async () => {
    const state = await getCurrentPersonState("p4");
    expect(state!.personaCount).toBe(1);
    expect(state!.jobTitle).toBe("Full-Stack Developer");
    expect(state!.traits).toHaveLength(0);
  });
});

describe("getPersonaTimeline", () => {
  it("returns timeline entries with scalar and trait changes", async () => {
    const timeline = await getPersonaTimeline("p1");
    expect(timeline).toHaveLength(3);

    // Seq 0: jobTitle, department, phone (3 scalars) + 5 traits
    expect(timeline[0].sequenceNum).toBe(0);
    expect(timeline[0].scalarChanges).toHaveLength(3);
    expect(timeline[0].traitChanges).toHaveLength(5);

    // Seq 1: jobTitle (1 scalar) + 3 traits
    expect(timeline[1].scalarChanges).toHaveLength(1);
    expect(timeline[1].scalarChanges[0].field).toBe("jobTitle");
    expect(timeline[1].traitChanges).toHaveLength(3);

    // Seq 2: department, phone, address (3 scalars) + 2 traits
    expect(timeline[2].scalarChanges).toHaveLength(3);
    expect(timeline[2].traitChanges).toHaveLength(2);
  });

  it("includes notes", async () => {
    const timeline = await getPersonaTimeline("p1");
    expect(timeline[0].note).toBe("Initial profile");
    expect(timeline[1].note).toContain("Promoted");
    expect(timeline[2].note).toContain("Berlin");
  });
});

describe("createPersona", () => {
  let createdPersonaSeqNum: number;

  it("auto-assigns next sequenceNum", async () => {
    const persona = await createPersona({
      personId: "p3",
      effectiveDate: new Date(),
      note: "Test persona for Vitest",
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
    createdPersonaSeqNum = persona.sequenceNum;
    expect(persona.sequenceNum).toBeGreaterThan(0);
  });

  it("new persona reflects in collapsed state", async () => {
    const state = await getCurrentPersonState("p3");
    expect(state!.jobTitle).toBe("Senior UX Designer");
    expect(state!.traits.find((t) => t.name === "Prototyping")).toBeDefined();
  });

  it("throws for nonexistent person", async () => {
    await expect(
      createPersona({
        personId: "nonexistent",
        effectiveDate: new Date(),
        note: "Should fail",
      }),
    ).rejects.toThrow("Person nonexistent not found");
  });
});

describe("findPeopleByTrait", () => {
  it("finds Sarah for React skill", async () => {
    const results = await findPeopleByTrait("tc-skill", "React");
    expect(results.some((r) => r.personId === "p1")).toBe(true);
  });

  it("returns empty for nonexistent trait", async () => {
    const results = await findPeopleByTrait("tc-skill", "COBOL");
    expect(results).toHaveLength(0);
  });
});

describe("findPeopleByTraitCategory", () => {
  it("finds multiple people with skills", async () => {
    const results = await findPeopleByTraitCategory("tc-skill");
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it("each result has at least one trait", async () => {
    const results = await findPeopleByTraitCategory("tc-skill");
    for (const r of results) {
      expect(r.traits.length).toBeGreaterThan(0);
      expect(r.traits.every((t) => t.traitCategoryId === "tc-skill")).toBe(true);
    }
  });
});
