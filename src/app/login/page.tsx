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
  { icon: UserPlus, line1: "Criação de", line2: "leads" },
  { icon: Target, line1: "Prospecção de", line2: "clientes" },
  { icon: Calendar, line1: "Agendamentos", line2: "integrados" },
  { icon: ListChecks, line1: "Acompanhamento", line2: "do ciclo" },
  { icon: BarChart3, line1: "Resultados", line2: "claros" }
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
            width={168}
            height={38}
            className="login-page__brand-mark"
            priority
          />
        </div>
        <div className="login-page__hero-body">
          <h1 className="login-page__headline">
            <span className="login-page__headline-line">Relacionamentos que</span>
            <span className="login-page__headline-line">geram negócios.</span>
          </h1>
          <p className="login-page__subhead">Sua operação comercial em um só lugar.</p>
          <ul className="login-page__features">
            {FEATURES.map(({ icon: Icon, line1, line2 }) => (
              <li key={`${line1}-${line2}`} className="login-page__feature">
                <span className="login-page__feature-icon">
                  <Icon size={22} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="login-page__feature-label">
                  <span className="login-page__feature-label-line">{line1}</span>
                  <span className="login-page__feature-label-line">{line2}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="login-page__auth" aria-label="Acesso ao sistema">
        <div className="login-page__auth-stack">
          <div className="login-card">
            <LoginForm />
          </div>
          <footer className="login-page__auth-footer">
            <p className="login-page__auth-footer-title">Inlift Group</p>
            <p className="login-page__auth-footer-sub">Gestão comercial</p>
          </footer>
        </div>
      </section>
    </main>
  );
}
