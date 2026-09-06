"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { getCsrfToken } from "@/lib/client/csrf";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start"
      onClick={async () => {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "X-CSRF-Token": getCsrfToken() },
        });
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      <LogOut size={18} />
      Sign out
    </Button>
  );
}
