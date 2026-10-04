import Image from "next/image";
import {
  BarChart3,
  Calendar,
  ListChecks,
  Target,
  UserPlus
} from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import "./login.css";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: UserPlus, label: "Criação de leads" },
  { icon: Target, label: "Prospecção de clientes" },
  { icon: Calendar, label: "Agendamentos integrados" },
  { icon: ListChecks, label: "Acompanhamento do ciclo" },
  { icon: BarChart3, label: "Resultados claros" }
] as const;

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <aside className="login-page__hero">
        <div className="login-page__brand">
          <Image
            src="/inlift-logo.png"
            alt="INLIFT GROUP"
            width={152}
            height={34}
            className="login-page__brand-mark"
            priority
          />
        </div>
        <div className="login-page__hero-body">
          <h1 className="login-page__headline">Relacionamentos que geram negócios.</h1>
          <p className="login-page__subhead">Sua operação comercial em um só lugar.</p>
          <ul className="login-page__features">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="login-page__feature">
                <span className="login-page__feature-icon">
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="login-page__feature-label">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="login-page__auth" aria-label="Acesso ao sistema">
        <div className="login-page__auth-inner">
          <div className="login-card">
            <LoginForm />
          </div>
        </div>
        <footer className="login-page__auth-footer">
          <p className="login-page__auth-footer-title">Inlift Group</p>
          <p className="login-page__auth-footer-sub">Gestão comercial</p>
        </footer>
      </section>
    </main>
  );
}
