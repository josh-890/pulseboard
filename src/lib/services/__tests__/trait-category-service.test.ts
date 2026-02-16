import { describe, it, expect } from "vitest";
import {
  getTraitCategories,
  getTraitCategoryById,
  createTraitCategory,
  updateTraitCategory,
  deleteTraitCategory,
} from "../trait-category-service";

/**
 * Integration tests for trait-category-service.
 * Requires seeded dev database (npx prisma db seed).
 */

describe("getTraitCategories", () => {
  it("returns all 6 seeded categories", async () => {
    const categories = await getTraitCategories();
    expect(categories).toHaveLength(6);
  });

  it("returns categories sorted by name", async () => {
    const categories = await getTraitCategories();
    const names = categories.map((c) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it("each category has required fields", async () => {
    const categories = await getTraitCategories();
    for (const c of categories) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe("getTraitCategoryById", () => {
  it("returns Skill category by id", async () => {
    const cat = await getTraitCategoryById("tc-skill");
    expect(cat).not.toBeNull();
    expect(cat!.name).toBe("Skill");
    expect(cat!.icon).toBe("zap");
  });

  it("returns null for nonexistent id", async () => {
    const cat = await getTraitCategoryById("nonexistent");
    expect(cat).toBeNull();
  });
});

describe("CRUD operations", () => {
  let createdId: string;

  it("creates a new trait category", async () => {
    const cat = await createTraitCategory({
      name: "Vitest Test Category",
      description: "Created by Vitest",
      icon: "test-tube",
    });
    createdId = cat.id;
    expect(cat.name).toBe("Vitest Test Category");
    expect(cat.icon).toBe("test-tube");
  });

  it("updates the created category", async () => {
    const updated = await updateTraitCategory(createdId, {
      description: "Updated by Vitest",
    });
    expect(updated.description).toBe("Updated by Vitest");
    expect(updated.name).toBe("Vitest Test Category");
  });

  it("soft-deletes the created category", async () => {
    const deleted = await deleteTraitCategory(createdId);
    expect(deleted.deletedAt).toBeInstanceOf(Date);

    // Should no longer appear in getTraitCategories
    const categories = await getTraitCategories();
    expect(categories.find((c) => c.id === createdId)).toBeUndefined();
  });
});
