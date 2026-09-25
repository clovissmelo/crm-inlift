"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/types";

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

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {user.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photo_path} alt="" className="avatar" width={36} height={36} />
        ) : (
          <span className="avatar">{initials}</span>
        )}
        <span>{user.name.split(" ")[0]}</span>
      </button>
      {open ? (
        <div className="user-menu-panel">
          <Link href="/perfil" onClick={() => setOpen(false)}>
            Acessar perfil
          </Link>
          <button type="button" onClick={logout}>
            Sair do sistema
          </button>
        </div>
      ) : null}
    </div>
  );
}
