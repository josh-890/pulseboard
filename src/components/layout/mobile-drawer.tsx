"use client";

import { useState } from "react";
import { Menu, LayoutDashboard, FolderKanban, Users, ImageIcon, Building2, Radio, Network, Settings, Clapperboard } from "lucide-react";
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
  { href: "/sessions", icon: <Clapperboard size={20} />, label: "Sessions" },
  { href: "/sets", icon: <ImageIcon size={20} />, label: "Sets" },
  { href: "/people", icon: <Users size={20} />, label: "People" },
  { href: "/projects", icon: <FolderKanban size={20} />, label: "Projects" },
  { href: "/labels", icon: <Building2 size={20} />, label: "Labels" },
  { href: "/channels", icon: <Radio size={20} />, label: "Channels" },
  { href: "/networks", icon: <Network size={20} />, label: "Networks" },
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
