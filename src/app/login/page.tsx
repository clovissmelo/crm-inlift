import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import "./login.css";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-logo-wrap">
          <Image
            src="/inlift-logo.png"
            alt="INLIFT GROUP"
            width={200}
            height={44}
            className="login-logo"
            priority
          />
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
