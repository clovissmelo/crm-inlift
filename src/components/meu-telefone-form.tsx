"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Api4comSetupProbe } from "@/lib/api4com/setup-probe";
import type { Api4comTokenPolicy } from "@/lib/api4com/token-policy-shared";
import { Api4comBdrFields } from "@/components/api4com-bdr-fields";
import type { User } from "@/lib/types";

export function MeuTelefoneForm({ user }: { user: User }) {
  const router = useRouter();
  const isBdr = user.roles.includes("bdr");
  const [api4comExtension, setApi4comExtension] = useState(user.api4com_extension ?? "");
  const [api4comApiToken, setApi4comApiToken] = useState("");
  const [hasApiToken, setHasApiToken] = useState(Boolean(user.has_api4com_api_token));
  const [api4comSipPassword, setApi4comSipPassword] = useState("");
  const [hasSipPassword, setHasSipPassword] = useState(Boolean(user.has_api4com_sip_password));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [api4comTokenPolicy, setApi4comTokenPolicy] = useState<Api4comTokenPolicy>("global");
  const [setupProbe, setSetupProbe] = useState<Api4comSetupProbe | null>(null);
  const [setupChecking, setSetupChecking] = useState(false);

  useEffect(() => {
    if (!isBdr) return;
    void fetch("/api/api4com/token-policy")
      .then((r) => r.json())
      .then((d: { policy?: Api4comTokenPolicy }) => setApi4comTokenPolicy(d.policy === "per_bdr" ? "per_bdr" : "global"))
      .catch(() => null);
  }, [isBdr]);

  async function runSetupCheck() {
    setSetupChecking(true);
    setSetupProbe(null);
    try {
      const res = await fetch("/api/api4com/setup-check");
      const data = (await res.json()) as Api4comSetupProbe & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível validar API4COM.");
        return;
      }
      setSetupProbe(data);
      if (!data.ok) setError(data.message);
      else {
        setError(null);
        setMessage(data.message);
      }
    } catch {
      setError("Não foi possível validar API4COM.");
    } finally {
      setSetupChecking(false);
    }
  }

  function profileIdentityPayload(): Record<string, string | null> {
    return { name: user.name, email: user.email, phone: user.phone ?? "" };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isBdr) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    const payload: Record<string, unknown> = {
      ...profileIdentityPayload(),
      api4com_extension: api4comExtension.trim() || null
    };
    if (api4comTokenPolicy === "per_bdr" && api4comApiToken.trim()) {
      payload.api4com_api_token = api4comApiToken.trim();
    }
    if (api4comSipPassword.trim()) {
      payload.api4com_sip_password = api4comSipPassword.trim();
    }

    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await res.json()) as { error?: string; user?: User };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    if (api4comApiToken.trim()) {
      setApi4comApiToken("");
      setHasApiToken(true);
    }
    if (data.user) {
      setHasApiToken(Boolean(data.user.has_api4com_api_token));
      setHasSipPassword(Boolean(data.user.has_api4com_sip_password));
      setApi4comSipPassword("");
      setApi4comExtension(data.user.api4com_extension ?? "");
    }
    setMessage("Telefonia atualizada.");
    router.refresh();
    if (api4comTokenPolicy === "per_bdr") {
      void runSetupCheck();
    }
  }

  async function clearApiToken() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profileIdentityPayload(), clear_api4com_api_token: true })
    });
    setLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao remover token");
      return;
    }
    setHasApiToken(false);
    setApi4comApiToken("");
    setMessage("Token API4COM removido do seu perfil.");
  }

  if (!isBdr) {
    return (
      <div className="panel" style={{ maxWidth: 520 }}>
        <p className="muted" style={{ margin: 0 }}>
          A integração de telefonia API4COM é configurada para usuários com perfil BDR. Se você precisa discar pelo CRM,
          peça ao administrador para ajustar seu perfil.
        </p>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={onSubmit} style={{ maxWidth: 520 }}>
      <span className="sr-only">Meu telefone</span>
      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <Api4comBdrFields
        extension={api4comExtension}
        onExtensionChange={setApi4comExtension}
        apiToken={api4comApiToken}
        onApiTokenChange={setApi4comApiToken}
        hasApiToken={hasApiToken}
        onClearToken={api4comTokenPolicy === "per_bdr" ? () => void clearApiToken() : undefined}
        clearingToken={loading}
        allowPersonalToken={api4comTokenPolicy === "per_bdr"}
        sipPassword={api4comSipPassword}
        onSipPasswordChange={setApi4comSipPassword}
        hasSipPassword={hasSipPassword}
        onClearSipPassword={() =>
          void (async () => {
            setLoading(true);
            const res = await fetch("/api/users/me", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...profileIdentityPayload(), clear_api4com_sip_password: true })
            });
            setLoading(false);
            if (res.ok) {
              setHasSipPassword(false);
              setApi4comSipPassword("");
              setMessage("Senha SIP removida.");
            }
          })()
        }
      />
      {api4comTokenPolicy === "per_bdr" ? (
        <div style={{ marginBottom: "1rem" }}>
          <button type="button" className="btn" disabled={loading || setupChecking} onClick={() => void runSetupCheck()}>
            {setupChecking ? "Validando…" : "Validar Integração"}
          </button>
          {setupProbe?.detail ? (
            <p className="muted" style={{ marginTop: 8, fontSize: "0.85rem" }}>
              {setupProbe.detail}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="profile-form-actions">
        <button className="btn btn-primary profile-form-action-btn" type="submit" disabled={loading}>
          Salvar
        </button>
      </div>
    </form>
  );
}
