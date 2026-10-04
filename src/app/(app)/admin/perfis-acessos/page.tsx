import { AccessProfilesAdmin } from "@/components/access-profiles-admin";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

export default function AdminPerfisAcessosPage() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Perfis controlam o <strong>menu lateral</strong> de cada usuário. Atribua perfis em{" "}
        <Link href="/admin/usuarios">Usuários</Link>. A função <strong>admin</strong> (papéis operacionais) continua
        necessária para telas de configuração avançada e APIs administrativas.
      </PageIntro>
      <AccessProfilesAdmin />
    </div>
  );
}
