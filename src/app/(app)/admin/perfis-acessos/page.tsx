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
        Cada perfil reúne <strong>Acessos</strong> (menu lateral) e <strong>Administrativos</strong> (BDR, dono de
        produto/empresa, gestor, administrador). Atribua perfis em <Link href="/admin/usuarios">Usuários</Link>. Itens
        de menu marcados como administrativos exigem o papel <strong>Administrador</strong> na mesma aba.
      </PageIntro>
      <AccessProfilesAdmin />
    </div>
  );
}
