import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { isSingleTenantMode } from "@/lib/tenants";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/api/health"];
const PUBLIC_PREFIXES = ["/_next/", "/favicon.ico", "/flags/", "/api/archive/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for public paths.
  // In multi-tenant mode, still try to inject x-tenant-id from the session cookie
  // if one is present — user-facing public routes (e.g. /api/archive/folders/search)
  // need the correct tenant even though they don't require authentication.
  // Sidecar/scanner callers have no session cookie and fall through to the default tenant.
  if (isPublicPath(pathname)) {
    if (!isSingleTenantMode()) {
      const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (sessionToken) {
        const session = await verifySessionToken(sessionToken);
        if (session) {
          const requestHeaders = new Headers(request.headers);
          requestHeaders.set("x-tenant-id", session.tenantId);
          return NextResponse.next({ request: { headers: requestHeaders } });
        }
      }
    }
    return NextResponse.next();
  }

  // Single-tenant mode: no auth required, set default tenant
  if (isSingleTenantMode()) {
    const response = NextResponse.next();
    response.headers.set("x-tenant-id", "default");
    return response;
  }

  // Multi-tenant mode: read session cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifySessionToken(sessionToken);
  if (!session) {
    // Invalid/expired session — clear cookie and redirect to login
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Set tenant ID header for downstream server components, actions, and routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", session.tenantId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
