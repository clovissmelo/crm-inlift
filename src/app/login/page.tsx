import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="brand" style={{ textAlign: "center", marginBottom: "0.25rem" }}>
          FUNON
        </div>
        <p className="muted" style={{ textAlign: "center", marginBottom: "1rem" }}>
          Da prospecção ao fechamento
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
