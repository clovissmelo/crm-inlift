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

function LoginHeroPattern() {
  return (
    <div className="login-hero-pattern" aria-hidden>
      <svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="login-line" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00adee" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#00adee" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <g stroke="url(#login-line)" strokeWidth="1" fill="none">
          <path d="M40 120 L220 80 L380 160 L560 90 L760 140" />
          <path d="M80 320 L260 280 L420 360 L600 300 L720 380" />
          <path d="M120 520 L300 480 L480 560 L640 500 L780 580" />
          <path d="M220 80 L260 280 L300 480" />
          <path d="M380 160 L420 360 L480 560" />
          <path d="M560 90 L600 300 L640 500" />
          <path d="M760 140 L720 380 L780 580" />
        </g>
        {[
          [40, 120],
          [220, 80],
          [380, 160],
          [560, 90],
          [760, 140],
          [80, 320],
          [260, 280],
          [420, 360],
          [600, 300],
          [720, 380],
          [120, 520],
          [300, 480],
          [480, 560],
          [640, 500],
          [780, 580]
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3" fill="#00adee" fillOpacity="0.55" />
        ))}
      </svg>
    </div>
  );
}

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <aside className="login-page__hero">
        <LoginHeroPattern />
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
