"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { setContributionRoleAction } from "@/lib/actions/contribution-actions";
import { cn } from "@/lib/utils";

export type ContributionRoleOption = { id: string; name: string; presence: "LEAD" | "SUPPORT" };

export type ContributionRoleSwitchProps = {
  contributionId: string;
  sessionId: string;
  roleId: string;
  roleName: string;
  /** The on-camera roles it can switch between — Model, Appearance */
  options: ContributionRoleOption[];
  /** Acts ticked for this contribution — switching to a support role drops them */
  actCount: number;
  personName: string;
};

// The role pill of an on-camera contributor, as a menu (2026-10-24): Model ↔
// Appearance. Someone only appearing carries no intensity, so switching to
// Appearance with acts ticked asks first.
export function ContributionRoleSwitch({
  contributionId,
  sessionId,
  roleId,
  roleName,
  options,
  actCount,
  personName,
}: ContributionRoleSwitchProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ContributionRoleOption | null>(null);
  const current = options.find((o) => o.id === roleId);
  const support = current?.presence === "SUPPORT";

  const apply = (role: ContributionRoleOption) =>
    startTransition(async () => {
      const res = await setContributionRoleAction(contributionId, sessionId, role.id);
      if (!res.success) {
        toast.error(res.error ?? "Could not change the role");
        return;
      }
      router.refresh();
    });

  const choose = (role: ContributionRoleOption) => {
    if (role.id === roleId) return;
    if (role.presence === "SUPPORT" && actCount > 0) setConfirm(role);
    else apply(role);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Role of ${personName}: ${roleName} — change`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              "hover:border-white/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60",
              support ? "border-dashed border-white/15 bg-transparent text-muted-foreground/80" : "border-white/15 bg-muted/50 text-muted-foreground",
            )}
          >
            {roleName}
            {pending ? <Loader2 size={10} className="animate-spin" aria-hidden="true" /> : <ChevronDown size={10} aria-hidden="true" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="text-xs">On camera as</DropdownMenuLabel>
          {options.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => choose(o)} className="gap-2">
              <Check size={12} className={cn(o.id === roleId ? "opacity-100" : "opacity-0")} aria-hidden="true" />
              <span>{o.name}</span>
              <span className="ml-auto pl-3 text-[11px] text-muted-foreground">
                {o.presence === "SUPPORT" ? "only appears" : "the model"}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {personName} as {confirm?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Someone only appearing carries no intensity. The {actCount === 1 ? "act" : `${actCount} acts`} ticked for{" "}
              {personName} in this session, with their extras and evidence photos, will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) apply(confirm);
                setConfirm(null);
              }}
            >
              Switch and remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
