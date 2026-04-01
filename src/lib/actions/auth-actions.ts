"use server";

import { redirect } from "next/navigation";
import { createSessionCookie, clearSessionCookie, verifyTenantPassword, tenantRequiresPassword } from "@/lib/auth";
import { getTenantConfig, getAllTenants, isSingleTenantMode } from "@/lib/tenants";

export type LoginResult =
  | { success: true }
  | { success: false; error: string };

export async function loginAction(tenantId: string, password: string): Promise<LoginResult> {
  if (isSingleTenantMode()) {
    return { success: false, error: "Authentication is not enabled in single-tenant mode." };
  }

  // Validate tenant exists
  try {
    getTenantConfig(tenantId);
  } catch {
    return { success: false, error: "Invalid credentials." };
  }

  // Verify password
  if (!verifyTenantPassword(tenantId, password)) {
    return { success: false, error: "Invalid credentials." };
  }

  await createSessionCookie(tenantId);
  return { success: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

export async function getAvailableTenants(): Promise<{ id: string; name: string; requiresPassword: boolean }[]> {
  if (isSingleTenantMode()) return [];
  return getAllTenants().map((t) => ({
    id: t.id,
    name: t.name,
    requiresPassword: tenantRequiresPassword(t.id),
  }));
}
