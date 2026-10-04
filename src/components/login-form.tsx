"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível entrar.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      <p className="login-form__eyebrow">CRM INLIFT</p>
      <h1 className="login-form__title">Bem-vindo de volta</h1>
      <p className="login-form__subtitle">Acesse sua conta para continuar.</p>

      {error ? <div className="login-error">{error}</div> : null}

      <div className="login-field">
        <label className="login-label" htmlFor="email">
          E-mail
        </label>
        <div className="login-input-wrap">
          <span className="login-input-icon" aria-hidden>
            <Mail size={18} strokeWidth={1.75} />
          </span>
          <input
            id="email"
            className="login-input"
            type="email"
            autoComplete="username"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="login-field">
        <label className="login-label" htmlFor="password">
          Senha
        </label>
        <div className="login-input-wrap">
          <span className="login-input-icon" aria-hidden>
            <Lock size={18} strokeWidth={1.75} />
          </span>
          <input
            id="password"
            className="login-input login-input--password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="login-input-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="login-forgot-row">
          <button type="button" className="login-forgot" onClick={() => {}}>
            Esqueci minha senha
          </button>
        </div>
      </div>

      <button className="login-submit" type="submit" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
        {!loading ? <ArrowRight size={18} strokeWidth={2.25} aria-hidden /> : null}
      </button>

      <p className="login-support">Problemas para acessar? Fale com o administrador.</p>
    </form>
  );
}
