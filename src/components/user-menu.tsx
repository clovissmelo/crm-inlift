"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/lib/types";

function displayFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserAvatar user={user} className="user-menu-avatar" />
        <span className="user-menu-name">{displayFirstName(user.name)}</span>
      </button>
      {open ? (
        <div className="user-menu-panel" role="menu">
          <Link href="/perfil" role="menuitem" onClick={() => setOpen(false)}>
            Acessar perfil
          </Link>
          <Link href={"/meu-telefone" as Route} role="menuitem" onClick={() => setOpen(false)}>
            Meu telefone
          </Link>
          <button type="button" role="menuitem" onClick={logout}>
            Sair do sistema
          </button>
        </div>
      ) : null}
    </div>
  );
}
