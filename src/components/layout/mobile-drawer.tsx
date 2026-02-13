"use client";

import { useState } from "react";
import { Menu, LayoutDashboard, FolderKanban, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLink } from "./nav-link";

const navItems = [
  { href: "/", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
  { href: "/projects", icon: <FolderKanban size={20} />, label: "Projects" },
  { href: "/settings", icon: <Settings size={20} />, label: "Settings" },
];

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
        <nav className="flex flex-col gap-1 px-3 pt-4">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              onClick={() => setOpen(false)}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
