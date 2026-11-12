"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavSections } from "./nav-sections";

export function MobileDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={24} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-card/90 backdrop-blur-md">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Pulseboard</SheetTitle>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-1 flex-col overflow-y-auto px-3 pb-4 pt-2">
          <NavSections part="main" onNavigate={() => setOpen(false)} />
        </nav>
        <nav aria-label="System" className="border-t border-foreground/15 px-3 py-3">
          <NavSections part="bottom" onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
