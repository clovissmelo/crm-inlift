"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/lib/types";

export function ProfileForm({ user }: { user: User }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function closePasswordSection() {
    setChangingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (changingPassword && !newPassword.trim()) {
      setError("Informe a nova senha.");
      setLoading(false);
      return;
    }
    if (changingPassword && newPassword.trim() && !currentPassword.trim()) {
      setError("Informe a senha atual.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        current_password: changingPassword && newPassword ? currentPassword : undefined,
        new_password: changingPassword && newPassword ? newPassword : undefined
      })
    });
    const data = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setMessage(changingPassword && newPassword ? "Perfil e senha atualizados." : "Perfil atualizado.");
    if (changingPassword) closePasswordSection();
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit} style={{ maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>Meu perfil</h1>
      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="field">
        <label className="label">Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label className="label">E-mail</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="field">
        <label className="label">WhatsApp / telefone</label>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {!changingPassword ? (
        <button type="button" className="btn" style={{ marginBottom: "1rem" }} onClick={() => setChangingPassword(true)}>
          Alterar senha
        </button>
      ) : (
        <div className="profile-password-block">
          <div className="field">
            <label className="label">Senha atual</label>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label className="label">Nova senha</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button type="button" className="btn" style={{ marginBottom: "1rem" }} onClick={closePasswordSection}>
            Cancelar alteração de senha
          </button>
        </div>
      )}

      <button className="btn btn-primary" type="submit" disabled={loading}>
        Salvar
      </button>
    </form>
  );
}
