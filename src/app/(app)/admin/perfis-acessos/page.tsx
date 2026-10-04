import { AccessProfilesAdmin } from "@/components/access-profiles-admin";
import Link from "next/link";

export default function AdminPerfisAcessosPage() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <AccessProfilesAdmin />
    </div>
  );
}
