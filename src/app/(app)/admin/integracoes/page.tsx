import { redirect } from "next/navigation";

/** Hub antigo — tudo está em /admin com ícones. */
export default function AdminIntegracoesRedirectPage() {
  redirect("/admin");
}
