"use client";

import { ExternalLink, Loader2, LockKeyhole, LogOut, Play, RefreshCw, Square } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AuthState = "checking" | "authenticated" | "unauthenticated";
type ActionMode = "idle" | "starting" | "stopping";

type PodStatusResponse = {
  ok: boolean;
  errorMessage?: string;
  missing?: string[];
  podId?: string;
  status?: string;
  desiredStatus?: string;
  machineId?: string;
  gpuCount?: number;
  gpuName?: string;
  lastStartedAt?: string;
  appUrl?: string;
  webuiUrl?: string;
  raw?: unknown;
};

type RunpodActionResponse = {
  ok: boolean;
  errorMessage?: string;
  message?: string;
  nextCheckAfterSeconds?: number;
  appUrl?: string;
  webuiUrl?: string;
};

type HealthTarget = {
  label: string;
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  errorMessage?: string | null;
};

type HealthResponse = {
  ok: boolean;
  appUrl: string;
  webuiUrl: string;
  app: HealthTarget;
  webuiDocs: HealthTarget;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });
  const data = await response.json().catch(() => ({})) as T;

  return { status: response.status, data };
}

function podStateLabel(status: PodStatusResponse | null, health: HealthResponse | null, mode: ActionMode) {
  if (mode === "stopping") {
    return "停止処理中";
  }

  if (mode === "starting") {
    return "起動中";
  }

  if (!status?.ok) {
    return "不明";
  }

  if (status.desiredStatus === "EXITED" || status.desiredStatus === "TERMINATED") {
    return "停止中";
  }

  if (status.desiredStatus === "RUNNING") {
    return health?.app.ok ? "起動済み" : "起動中";
  }

  return "不明";
}

function stateTone(state: string) {
  if (state === "起動済み") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (state === "起動中") {
    return "border-cyanfire-500/30 bg-cyanfire-500/10 text-cyanfire-300";
  }

  if (state === "停止処理中") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }

  if (state === "停止中") {
    return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }

  return "border-red-400/30 bg-red-500/10 text-red-200";
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function LaunchControllerApp() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [loginUser, setLoginUser] = useState("user");
  const [loginPassword, setLoginPassword] = useState("password");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [status, setStatus] = useState<PodStatusResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [mode, setMode] = useState<ActionMode>("idle");
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statusResult, healthResult] = await Promise.all([
        requestJson<PodStatusResponse>("/api/runpod/status"),
        requestJson<HealthResponse>("/api/runpod/health")
      ]);

      if (statusResult.status === 401 || healthResult.status === 401) {
        setAuthState("unauthenticated");
        return;
      }

      setStatus(statusResult.data);
      setHealth(healthResult.data);

      if (healthResult.data.app?.ok) {
        setMessage("SD Mobile Controllerを開けます。");
        setMode("idle");
        setIsPolling(false);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const session = await requestJson<{ authenticated: boolean }>("/api/auth/session");
      if (!session.data.authenticated) {
        setAuthState("unauthenticated");
        return;
      }

      setAuthState("authenticated");
      await refreshAll();
    };

    initialize().catch(() => setAuthState("unauthenticated"));
  }, [refreshAll]);

  useEffect(() => {
    if (authState !== "authenticated" || !isPolling) {
      return;
    }

    const interval = window.setInterval(() => {
      refreshAll().catch(() => undefined);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [authState, isPolling, refreshAll]);

  const state = useMemo(() => podStateLabel(status, health, mode), [health, mode, status]);
  const appUrl = health?.appUrl || status?.appUrl || "";
  const appCanOpen = Boolean(appUrl && health?.app.ok);
  const isStopped = state === "停止中" || status?.desiredStatus === "EXITED" || status?.desiredStatus === "TERMINATED";

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const result = await requestJson<{ ok: boolean; errorMessage?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ user: loginUser, password: loginPassword })
      });

      if (!result.data.ok) {
        setLoginError(result.data.errorMessage ?? "ログインに失敗しました。");
        return;
      }

      setAuthState("authenticated");
      await refreshAll();
    } catch {
      setLoginError("ログインに失敗しました。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleStart = async () => {
    setMode("starting");
    setMessage("Pod起動要求を送信しています。");
    const result = await requestJson<RunpodActionResponse>("/api/runpod/start", {
      method: "POST"
    });
    if (!result.data.ok) {
      setMode("idle");
      setMessage(result.data.errorMessage ?? "Pod起動に失敗しました。");
      return;
    }

    setMessage(`${result.data.message ?? "Pod起動要求を送信しました。"} ${result.data.nextCheckAfterSeconds ?? 5}秒後から状態を確認します。`);
    setIsPolling(true);
    await refreshAll();
  };

  const handleStop = async () => {
    setMode("stopping");
    setMessage("停止要求を送信しています。");
    const result = await requestJson<RunpodActionResponse>("/api/runpod/stop", {
      method: "POST"
    });
    if (!result.data.ok) {
      setMode("idle");
      setMessage(result.data.errorMessage ?? "Pod停止に失敗しました。");
      return;
    }

    setMessage(result.data.message ?? "停止要求を送信しました。");
    setIsPolling(true);
    await refreshAll();
  };

  const handleLogout = async () => {
    await requestJson<{ ok: boolean }>("/api/auth/logout", {
      method: "POST"
    }).catch(() => undefined);
    setAuthState("unauthenticated");
    setStatus(null);
    setHealth(null);
    setMessage("");
    setMode("idle");
    setIsPolling(false);
  };

  if (authState === "checking") {
    return (
      <LaunchFrame>
        <section className="mobile-panel flex items-center gap-3 p-4 text-[13px] text-slate-300">
          <Loader2 className="animate-spin text-cyanfire-400" size={18} />
          セッションを確認しています
        </section>
      </LaunchFrame>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LaunchFrame>
        <section className="mobile-panel space-y-4 p-5">
          <div>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[8px] bg-cyanfire-500/10 text-cyanfire-400 ring-1 ring-cyanfire-500/25">
              <LockKeyhole size={22} />
            </div>
            <h1 className="text-[22px] font-black leading-tight text-white">SD Launch Controller</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              RunPod Podを起動する入口です。先にログインしてください。
            </p>
          </div>
          <Field label="Login ID" value={loginUser} onChange={setLoginUser} />
          <Field label="Password" type="password" value={loginPassword} onChange={setLoginPassword} />
          {loginError ? <Alert tone="error">{loginError}</Alert> : null}
          <button className="touch-button min-h-[52px] w-full bg-cyanfire-500 text-slate-950" disabled={isLoggingIn} onClick={handleLogin}>
            {isLoggingIn ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />}
            ログイン
          </button>
        </section>
      </LaunchFrame>
    );
  }

  return (
    <LaunchFrame>
      <div className="space-y-4">
        <section className="mobile-panel space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-black leading-tight text-white">SD Launch Controller</h1>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">RunPod REST API 起動管理</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge label={state} className={stateTone(state)} />
              <button className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400" onClick={handleLogout}>
                <LogOut size={13} />
                ログアウト
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <InfoPill label="Pod ID" value={status?.podId || "-"} />
            <InfoPill label="GPU" value={status?.gpuName || `${status?.gpuCount ?? 0} GPU`} />
            <InfoPill label="desired" value={status?.desiredStatus || "-"} />
            <InfoPill label="last start" value={formatDate(status?.lastStartedAt)} />
          </div>

          {status && !status.ok ? <Alert tone="error">{status.errorMessage ?? "RunPod状態を取得できませんでした。"}</Alert> : null}
          {message ? <Alert tone={message.includes("失敗") || message.includes("未設定") ? "error" : "normal"}>{message}</Alert> : null}
        </section>

        <section className="mobile-panel space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" disabled={isRefreshing} onClick={() => refreshAll()}>
              {isRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              状態更新
            </button>
            <button className="touch-button bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/25" disabled={mode === "starting"} onClick={handleStart}>
              <Play size={16} />
              Pod起動
            </button>
            <button className="touch-button bg-red-500/10 text-red-200 ring-1 ring-red-500/25" disabled={mode === "stopping"} onClick={handleStop}>
              <Square size={15} />
              Pod停止
            </button>
            <button
              className="touch-button bg-cyanfire-500 text-slate-950"
              disabled={isStopped || !appCanOpen}
              onClick={() => window.open(appUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink size={16} />
              開く
            </button>
          </div>
          <p className="text-[12px] leading-relaxed text-slate-500">
            Pod起動後は5秒ごとに状態と応答を確認します。アプリ応答がOKになるまで待ってから開いてください。
          </p>
        </section>

        <section className="mobile-panel space-y-3 p-4">
          <h2 className="section-title">応答確認</h2>
          <HealthRow title="SD Mobile Controller" target={health?.app} />
          <HealthRow title="A1111 API docs" target={health?.webuiDocs} />
          {appCanOpen ? <Alert tone="normal">SD Mobile Controllerを開けます。</Alert> : null}
        </section>
      </div>
    </LaunchFrame>
  );
}

function LaunchFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen justify-center px-2 py-0 text-slate-100 sm:px-4 sm:py-5">
      <div className="relative min-h-screen w-full max-w-[430px] overflow-hidden bg-graphite-950 shadow-phone sm:min-h-[calc(100vh-40px)] sm:rounded-[28px] sm:border sm:border-white/10">
        <div className="min-h-screen overflow-y-auto px-4 py-4 sm:min-h-[calc(100vh-40px)]">
          {children}
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange
}: {
  label: string;
  type?: "text" | "password";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="field-label">{label}</span>
      <input className="field-control" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-bold ${className}`}>
      {label}
    </span>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-black/20 p-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 break-all text-[13px] font-bold text-slate-100">{value}</p>
    </div>
  );
}

function Alert({ tone, children }: { tone: "normal" | "error"; children: ReactNode }) {
  return (
    <p className={`rounded-[8px] p-3 text-[13px] leading-relaxed ${tone === "error" ? "bg-red-500/10 text-red-100" : "bg-cyanfire-500/10 text-cyanfire-100"}`}>
      {children}
    </p>
  );
}

function HealthRow({ title, target }: { title: string; target?: HealthTarget }) {
  const ok = Boolean(target?.ok);

  return (
    <div className="rounded-[8px] bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-slate-100">{title}</p>
          <p className="mt-1 break-all text-[10px] text-slate-500">{target?.url || "-"}</p>
        </div>
        <StatusBadge
          label={ok ? "応答あり" : "未応答"}
          className={ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
        <span>status: {target?.status ?? "-"}</span>
        <span className="break-all">type: {target?.contentType ?? "-"}</span>
      </div>
      {target?.errorMessage ? <p className="mt-2 text-[12px] leading-relaxed text-amber-100">{target.errorMessage}</p> : null}
    </div>
  );
}
