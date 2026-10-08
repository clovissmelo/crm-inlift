import type { User } from "@/lib/types";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export function UserAvatar({ user, className }: { user: User; className?: string }) {
  const cls = className ? `avatar ${className}` : "avatar";
  if (user.photo_path) {
    return <img className={cls} src={user.photo_path} alt="" width={36} height={36} />;
  }
  return (
    <span className={cls} aria-hidden>
      {initialsFromName(user.name)}
    </span>
  );
}
