/**
 * Shared action result types for server actions.
 *
 * CrudActionResult — CRUD actions that return an id on success and may include field errors
 * SimpleActionResult — Simple success/failure actions
 */

/** Result for create/update actions that return an entity id */
export type CrudActionResult =
  | { success: true; id: string }
  | { success: false; error: { fieldErrors?: Record<string, string[]> } | string };

/** Result for simple operations (deletes, toggles, etc.) */
export type SimpleActionResult = { success: boolean; error?: string };
