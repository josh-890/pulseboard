import { cookies } from "next/headers";

const COOKIE_NAME = "pb_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSigningKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("SESSION_SECRET env var is required for authentication");
  }
  return key;
}

// ── HMAC signing with Web Crypto ─────────────────────────────────────────────

async function sign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSigningKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const sig = Buffer.from(signature).toString("base64url");
  return `${payload}.${sig}`;
}

async function verify(token: string): Promise<string | null> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = token.slice(0, lastDot);
  const expectedToken = await sign(payload);
  if (token !== expectedToken) return null;

  return payload;
}

// ── Session cookie helpers ───────────────────────────────────────────────────

export type SessionData = {
  tenantId: string;
};

function encodeSession(data: SessionData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decodeSession(payload: string): SessionData | null {
  try {
    const json = Buffer.from(payload, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "tenantId" in parsed &&
      typeof (parsed as SessionData).tenantId === "string"
    ) {
      return parsed as SessionData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a signed session cookie for the given tenant.
 */
export async function createSessionCookie(tenantId: string): Promise<void> {
  const payload = encodeSession({ tenantId });
  const token = await sign(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Read and verify the session cookie, returning the session data or null.
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verify(token);
  if (!payload) return null;

  return decodeSession(payload);
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Verify a tenant password against the env var.
 */
/**
 * Check if a tenant requires a password (has TENANT_<ID>_PASSWORD set and non-empty).
 */
export function tenantRequiresPassword(tenantId: string): boolean {
  const upper = tenantId.toUpperCase();
  return !!process.env[`TENANT_${upper}_PASSWORD`];
}

/**
 * Verify a tenant password against the env var.
 * If no password is configured for the tenant, any input (including empty) is accepted.
 */
export function verifyTenantPassword(tenantId: string, password: string): boolean {
  const upper = tenantId.toUpperCase();
  const expected = process.env[`TENANT_${upper}_PASSWORD`];
  // No password configured → open access
  if (!expected) return true;
  // Constant-time comparison
  if (expected.length !== password.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Read the tenant ID from the session cookie (for middleware use).
 * This is a lower-level function that doesn't use next/headers cookies() —
 * it takes the raw cookie value directly.
 */
export async function verifySessionToken(token: string): Promise<SessionData | null> {
  const payload = await verify(token);
  if (!payload) return null;
  return decodeSession(payload);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
