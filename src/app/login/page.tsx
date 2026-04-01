"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loginAction, getAvailableTenants } from "@/lib/actions/auth-actions";

type TenantOption = { id: string; name: string; requiresPassword: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTenant = tenants.find((t) => t.id === tenantId);
  const needsPassword = selectedTenant?.requiresPassword ?? false;

  useEffect(() => {
    getAvailableTenants().then((t) => {
      setTenants(t);
      if (t.length === 1) setTenantId(t[0].id);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    if (needsPassword && !password) return;

    setIsSubmitting(true);
    try {
      const result = await loginAction(tenantId, password);
      if (result.success) {
        router.push("/");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/20 bg-card/70 p-8 shadow-md backdrop-blur-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Pulseboard</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tenants.length > 1 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Account</label>
              <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setPassword(""); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : tenants.length === 1 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Account</label>
              <Input value={tenants[0].name} disabled />
            </div>
          ) : null}

          {needsPassword && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
              />
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !tenantId || (needsPassword && !password)}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
