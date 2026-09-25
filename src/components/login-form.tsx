"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <h1 className="login-title">
        Acessar o sistema
        <span className="login-title-dot" aria-hidden />
      </h1>

      {error ? <div className="login-error">{error}</div> : null}

      <div className="login-field">
        <label className="login-label" htmlFor="email">
          Usuário
        </label>
        <input
          id="email"
          className="login-input"
          type="email"
          autoComplete="username"
          placeholder=""
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="login-field">
        <label className="login-label" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          className="login-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="login-forgot-row">
          <button type="button" className="login-forgot" onClick={() => {}}>
            Esqueci minha senha
          </button>
        </div>
      </div>

      <button className="login-submit" type="submit" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
