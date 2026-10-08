"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Api4comSetupProbe } from "@/lib/api4com/setup-probe";
import type { Api4comTokenPolicy } from "@/lib/api4com/token-policy-shared";
import type { SyncSipPasswordResult } from "@/lib/api4com/sync-sip-password";
import { Api4comBdrFields } from "@/components/api4com-bdr-fields";
import { useApi4comWebphone } from "@/components/api4com-call-provider";
import type { User } from "@/lib/types";

type SipConnectionProbe = {
  ok: boolean;
  message: string;
};

export function MeuTelefoneForm({ user }: { user: User }) {
  const router = useRouter();
  const webphone = useApi4comWebphone();
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
  const [sipSyncing, setSipSyncing] = useState(false);
  const [sipTesting, setSipTesting] = useState(false);
  const [sipProbe, setSipProbe] = useState<SipConnectionProbe | null>(null);
  const autoSipSyncAttempted = useRef(false);

  useEffect(() => {
    if (!isBdr) return;
    void fetch("/api/api4com/token-policy")
      .then((r) => r.json())
      .then((d: { policy?: Api4comTokenPolicy }) => setApi4comTokenPolicy(d.policy === "per_bdr" ? "per_bdr" : "global"))
      .catch(() => null);
  }, [isBdr]);

  const canTrySipSync = useCallback(() => {
    if (!api4comExtension.trim()) return false;
    if (hasSipPassword) return false;
    if (api4comTokenPolicy === "per_bdr" && !hasApiToken && !api4comApiToken.trim()) return false;
    return true;
  }, [api4comApiToken, api4comExtension, api4comTokenPolicy, hasApiToken, hasSipPassword]);

  const syncSipPasswordFromApi = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!canTrySipSync()) return null;
      setSipSyncing(true);
      if (!opts?.silent) {
        setError(null);
        setMessage(null);
      }
      try {
        const res = await fetch("/api/api4com/sync-sip-password", { method: "POST" });
        const data = (await res.json()) as SyncSipPasswordResult & { error?: string };
        if (!res.ok && !data.message) {
          if (!opts?.silent) setError(data.error ?? "Não foi possível sincronizar a senha SIP.");
          return data;
        }
        if (data.saved) {
          setHasSipPassword(true);
          setApi4comSipPassword("");
          if (!opts?.silent) {
            setMessage(data.message);
            router.refresh();
          }
        } else if (!opts?.silent && data.message && !data.already_configured) {
          setMessage(data.message);
        }
        return data;
      } catch {
        if (!opts?.silent) setError("Não foi possível sincronizar a senha SIP.");
        return null;
      } finally {
        setSipSyncing(false);
      }
    },
    [canTrySipSync, router]
  );

  useEffect(() => {
    if (!isBdr || autoSipSyncAttempted.current) return;
    if (!canTrySipSync()) return;
    autoSipSyncAttempted.current = true;
    void syncSipPasswordFromApi({ silent: false });
  }, [isBdr, canTrySipSync, syncSipPasswordFromApi]);

  async function runSetupCheck() {
    setSetupChecking(true);
    setSetupProbe(null);
    setError(null);
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

  async function runSipConnectionTest() {
    setSipTesting(true);
    setSipProbe(null);
    setError(null);
    try {
      if (!webphone) {
        setSipProbe({
          ok: false,
          message: "Discador indisponível nesta sessão. Recarregue a página."
        });
        return;
      }
      if (!hasSipPassword) {
        const synced = await syncSipPasswordFromApi({ silent: true });
        if (!synced?.saved && !hasSipPassword) {
          setSipProbe({
            ok: false,
            message: "Cadastre ou sincronize a senha SIP antes do teste de conexão."
          });
          return;
        }
      }
      const ok = await webphone.ensureRegistered({ userId: user.id, openPanel: false });
      setSipProbe({
        ok,
        message: ok
          ? "Conexão SIP OK — ramal registrou no servidor (WSS)."
          : `Falha no registro SIP (${webphone.status}). Confira senha SIP e domínio em Admin → API4COM → Credenciais.`
      });
      if (!ok) {
        await webphone.recoverFromDialFailure();
      }
    } catch {
      setSipProbe({ ok: false, message: "Erro ao testar conexão SIP." });
    } finally {
      setSipTesting(false);
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
    autoSipSyncAttempted.current = false;
    if (!data.user?.has_api4com_sip_password) {
      await syncSipPasswordFromApi({ silent: false });
    } else {
      setMessage("Telefonia atualizada.");
    }
    router.refresh();
    void runSetupCheck();
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
      {sipSyncing ? (
        <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 0 }}>
          Buscando senha SIP na API4COM para o ramal cadastrado…
        </p>
      ) : null}

      <Api4comBdrFields
        extension={api4comExtension}
        onExtensionChange={setApi4comExtension}
        apiToken={api4comApiToken}
        onApiTokenChange={setApi4comApiToken}
        hasApiToken={hasApiToken || api4comTokenPolicy === "global"}
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
              autoSipSyncAttempted.current = false;
              setMessage("Senha SIP removida.");
            }
          })()
        }
      />

      <section className="meu-telefone-tests" aria-label="Testes de telefonia">
        <h3 className="meu-telefone-tests-title">Testes</h3>

        <div className="meu-telefone-test-block">
          <p className="meu-telefone-test-label">1. Integração API (token e ramal na API4COM)</p>
          <button
            type="button"
            className="btn"
            disabled={loading || setupChecking || sipTesting}
            onClick={() => void runSetupCheck()}
          >
            {setupChecking ? "Validando…" : "Validar integração"}
          </button>
          {setupProbe?.detail ? (
            <p className="muted meu-telefone-test-detail">{setupProbe.detail}</p>
          ) : null}
        </div>

        <div className="meu-telefone-test-block">
          <p className="meu-telefone-test-label">2. Conexão SIP (discador no navegador)</p>
          <button
            type="button"
            className="btn"
            disabled={loading || setupChecking || sipTesting || sipSyncing}
            onClick={() => void runSipConnectionTest()}
          >
            {sipTesting ? "Testando SIP…" : "Testar conexão SIP"}
          </button>
          {sipProbe ? (
            <p className={sipProbe.ok ? "meu-telefone-test-ok meu-telefone-test-detail" : "alert alert-error meu-telefone-test-detail"}>
              {sipProbe.message}
            </p>
          ) : null}
        </div>

        {canTrySipSync() ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={sipSyncing || loading}
            onClick={() => void syncSipPasswordFromApi()}
          >
            {sipSyncing ? "Sincronizando…" : "Sincronizar senha SIP da API4COM"}
          </button>
        ) : null}
      </section>

      <div className="profile-form-actions">
        <button className="btn btn-primary profile-form-action-btn" type="submit" disabled={loading || sipSyncing}>
          Salvar
        </button>
      </div>
    </form>
  );
}
