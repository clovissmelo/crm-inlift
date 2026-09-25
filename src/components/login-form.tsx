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
    <form className="panel" onSubmit={onSubmit}>
      <h1 style={{ marginTop: 0 }}>Entrar</h1>
      <p className="muted">Acesso interno ao Funon</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="field">
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
