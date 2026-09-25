"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/lib/types";

export function ProfileForm({ user }: { user: User }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [photoPreview, setPhotoPreview] = useState(user.photo_path);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Arquivo acima de 5 MB.");
      return;
    }
    setPhotoPreview(URL.createObjectURL(file));
    const form = new FormData();
    form.append("photo", file);
    const res = await fetch("/api/users/me/photo", { method: "POST", body: form });
    const data = (await res.json()) as { error?: string; photo_path?: string };
    if (!res.ok) {
      setError(data.error ?? "Falha no upload");
      setPhotoPreview(user.photo_path);
      return;
    }
    if (data.photo_path) setPhotoPreview(data.photo_path);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        current_password: newPassword ? currentPassword : undefined,
        new_password: newPassword || undefined
      })
    });
    const data = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setMessage("Perfil atualizado.");
    setCurrentPassword("");
    setNewPassword("");
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit} style={{ maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>Meu perfil</h1>
      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="field">
        <label className="label">Foto</label>
        {photoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoPreview} alt="" className="avatar" width={72} height={72} style={{ width: 72, height: 72 }} />
        ) : null}
        <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} />
      </div>

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
      <div className="field">
        <label className="label">Senha atual (para alterar senha)</label>
        <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Nova senha</label>
        <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </div>

      <button className="btn btn-primary" type="submit" disabled={loading}>
        Salvar
      </button>
    </form>
  );
}
