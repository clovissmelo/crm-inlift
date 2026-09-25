import Link from "next/link";
import { UsersAdmin } from "@/components/users-admin";

export const dynamic = "force-dynamic";

export default function AdminUsuariosPage() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <UsersAdmin canDelete />
    </div>
  );
}
