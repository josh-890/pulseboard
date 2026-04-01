import { withTenantFromHeaders } from "@/lib/tenant-context";
import { BodyRegionDebugger } from "@/components/dev/body-region-debugger";

export default async function BodyRegionsDevPage() {
  return withTenantFromHeaders(async () => {
    return <BodyRegionDebugger />;
  });
}
