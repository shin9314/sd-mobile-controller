"use client";

import {
  Bell,
  BellRing,
  ExternalLink,
  Loader2,
  LockKeyhole,
  LogOut,
  Play,
  RefreshCw,
  Square,
  Volume2,
  XCircle
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AuthState = "checking" | "authenticated" | "unauthenticated";
type ActionMode = "idle" | "retrying" | "polling" | "stopping";
type NotificationState = "unknown" | "default" | "granted" | "denied" | "unsupported";

type LaunchConfig = {
  startRetryIntervalSeconds: number;
  maxStartAttempts: number;
  statusPollIntervalSeconds: number;
};

type PodStatusResponse = {
  ok: boolean;
  status?: string | number;
  errorMessage?: string;
  missing?: string[];
  podId?: string;
  desiredStatus?: string;
  machineId?: string;
  gpuCount?: number;
  gpuName?: string;
  lastStartedAt?: string;
  appUrl?: string;
  webuiUrl?: string;
  launchConfig?: LaunchConfig;
  raw?: unknown;
};

type RunpodActionResponse = {
  ok: boolean;
  status?: number;
  retryable?: boolean;
  retryAfterSeconds?: number;
  errorMessage?: string;
  message?: string;
  nextCheckAfterSeconds?: number;
  appUrl?: string;
  webuiUrl?: string;
  launchConfig?: LaunchConfig;
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
  launchConfig?: LaunchConfig;
};

type RetryState = {
  active: boolean;
  attempt: number;
  maxAttempts: number;
  countdownSeconds: number | null;
  lastStatus: number | null;
  lastError: string;
};

type LaunchLog = {
  id: string;
  time: string;
  message: string;
};

const DEFAULT_LAUNCH_CONFIG: LaunchConfig = {
  startRetryIntervalSeconds: 8,
  maxStartAttempts: 150,
  statusPollIntervalSeconds: 5
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

function normalized(value?: string | number) {
  return String(value ?? "").toUpperCase();
}

function isPodRunning(status: PodStatusResponse | null) {
  if (!status?.ok) {
    return false;
  }

  return normalized(status.status) === "RUNNING" || normalized(status.desiredStatus) === "RUNNING";
}

function isPodStopped(status: PodStatusResponse | null) {
  if (!status?.ok) {
    return false;
  }

  const actual = normalized(status.status);
  const desired = normalized(status.desiredStatus);
  return ["EXITED", "TERMINATED", "STOPPED"].includes(actual) || ["EXITED", "TERMINATED", "STOPPED"].includes(desired);
}

function podStateLabel(status: PodStatusResponse | null, health: HealthResponse | null, mode: ActionMode) {
  if (mode === "stopping") {
    return "停止処理中";
  }

  if (mode === "retrying") {
    return "起動リトライ中";
  }

  if (mode === "polling") {
    return health?.app.ok ? "起動済み" : "起動中";
  }

  if (!status?.ok) {
    return "不明";
  }

  if (isPodStopped(status)) {
    return "停止中";
  }

  if (isPodRunning(status)) {
    return health?.app.ok ? "起動済み" : "起動中";
  }

  return "不明";
}

function stateTone(state: string) {
  if (state === "起動済み") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (state === "起動中" || state === "起動リトライ中") {
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

function notificationLabel(state: NotificationState) {
  if (state === "granted") {
    return "許可済み";
  }

  if (state === "denied") {
    return "拒否";
  }

  if (state === "unsupported") {
    return "非対応";
  }

  return "未確認";
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

function nowLabel() {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatMaxWait(config: LaunchConfig) {
  const totalSeconds = config.startRetryIntervalSeconds * config.maxStartAttempts;
  if (totalSeconds < 60) {
    return `約${totalSeconds}秒`;
  }

  return `約${Math.round(totalSeconds / 60)}分`;
}

function playBeep() {
  const windowWithAudio = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext ?? windowWithAudio.webkitAudioContext;
  if (!AudioContextCtor) {
    return false;
  }

  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);
  return true;
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
  const [launchConfig, setLaunchConfig] = useState<LaunchConfig>(DEFAULT_LAUNCH_CONFIG);
  const [retryState, setRetryState] = useState<RetryState>({
    active: false,
    attempt: 0,
    maxAttempts: DEFAULT_LAUNCH_CONFIG.maxStartAttempts,
    countdownSeconds: null,
    lastStatus: null,
    lastError: ""
  });
  const [notificationState, setNotificationState] = useState<NotificationState>("unknown");
  const [logs, setLogs] = useState<LaunchLog[]>([]);

  const cancelRetryRef = useRef(false);
  const startFlowActiveRef = useRef(false);
  const successNotifiedRef = useRef(false);

  const addLog = useCallback((entry: string) => {
    setLogs((current) => [
      { id: `${Date.now()}-${Math.random()}`, time: nowLabel(), message: entry },
      ...current
    ].slice(0, 80));
  }, []);

  const applyLaunchConfig = useCallback((next?: LaunchConfig) => {
    if (!next) {
      return;
    }

    setLaunchConfig({
      startRetryIntervalSeconds: next.startRetryIntervalSeconds || DEFAULT_LAUNCH_CONFIG.startRetryIntervalSeconds,
      maxStartAttempts: next.maxStartAttempts || DEFAULT_LAUNCH_CONFIG.maxStartAttempts,
      statusPollIntervalSeconds: next.statusPollIntervalSeconds || DEFAULT_LAUNCH_CONFIG.statusPollIntervalSeconds
    });
  }, []);

  const refreshAll = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) {
      setIsRefreshing(true);
    }

    try {
      const [statusResult, healthResult] = await Promise.all([
        requestJson<PodStatusResponse>("/api/runpod/status"),
        requestJson<HealthResponse>("/api/runpod/health")
      ]);

      if (statusResult.status === 401 || healthResult.status === 401) {
        setAuthState("unauthenticated");
        return null;
      }

      setStatus(statusResult.data);
      setHealth(healthResult.data);
      applyLaunchConfig(statusResult.data.launchConfig ?? healthResult.data.launchConfig);

      return {
        status: statusResult.data,
        health: healthResult.data
      };
    } finally {
      if (!quiet) {
        setIsRefreshing(false);
      }
    }
  }, [applyLaunchConfig]);

  const triggerStartSuccessNotification = useCallback(async () => {
    if (successNotifiedRef.current) {
      return;
    }

    successNotifiedRef.current = true;
    setMessage("SD Mobile Controllerを開けます。");
    addLog("SD Mobile Controller応答OK");

    if ("Notification" in window) {
      setNotificationState(Notification.permission);
      if (Notification.permission === "granted") {
        new Notification("RunPod起動完了", {
          body: "SD Mobile Controllerを開けます。"
        });
        addLog("ブラウザ通知を送信しました");
      }
    }

    if (playBeep()) {
      addLog("通知音を再生しました");
    }

    if ("vibrate" in navigator) {
      navigator.vibrate([300, 150, 300]);
      addLog("バイブ通知を実行しました");
    }

    const webhookResult = await requestJson<{ ok: boolean; skipped?: boolean; message?: string; errorMessage?: string }>("/api/notify/start-success", {
      method: "POST"
    }).catch(() => null);
    if (webhookResult?.data.ok) {
      addLog(webhookResult.data.skipped ? "Webhook通知は未設定のためスキップしました" : "Webhook通知を送信しました");
    } else if (webhookResult?.data.errorMessage) {
      addLog(webhookResult.data.errorMessage);
    }
  }, [addLog]);

  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      return;
    }

    setNotificationState(Notification.permission);
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
      refreshAll({ quiet: true }).catch(() => undefined);
    }, launchConfig.statusPollIntervalSeconds * 1000);

    return () => window.clearInterval(interval);
  }, [authState, isPolling, launchConfig.statusPollIntervalSeconds, refreshAll]);

  const appUrl = health?.appUrl || status?.appUrl || "";
  const appCanOpen = Boolean(appUrl && health?.app.ok);
  const state = useMemo(() => podStateLabel(status, health, mode), [health, mode, status]);
  const stopped = isPodStopped(status);
  const running = isPodRunning(status);
  const controllerReady = running && appCanOpen;

  useEffect(() => {
    if (authState !== "authenticated") {
      document.title = "SD Launch Controller";
      return;
    }

    if (mode === "retrying") {
      document.title = `[起動中 ${retryState.attempt}/${retryState.maxAttempts}] SD Launch Controller`;
      return;
    }

    if (controllerReady) {
      document.title = "[起動完了] SD Launch Controller";
      return;
    }

    document.title = "SD Launch Controller";
  }, [authState, controllerReady, mode, retryState.attempt, retryState.maxAttempts]);

  useEffect(() => {
    if (mode === "stopping") {
      if (stopped) {
        setMode("idle");
        setIsPolling(false);
        addLog("Pod停止状態を確認しました");
      }

      return;
    }

    if (running && mode === "retrying") {
      setMode("polling");
      setIsPolling(true);
      setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
      addLog("Pod状態 RUNNING を確認しました");
    }
  }, [addLog, mode, running, stopped]);

  useEffect(() => {
    if (!controllerReady) {
      return;
    }

    if (startFlowActiveRef.current || mode === "polling" || mode === "retrying") {
      setMode("idle");
      setIsPolling(false);
      setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
      triggerStartSuccessNotification().catch(() => undefined);
    }
  }, [controllerReady, mode, triggerStartSuccessNotification]);

  const waitForRetry = useCallback(async (seconds: number) => {
    for (let remaining = seconds; remaining > 0; remaining -= 1) {
      if (cancelRetryRef.current) {
        return false;
      }

      setRetryState((current) => ({ ...current, countdownSeconds: remaining }));

      if (remaining !== seconds && remaining % launchConfig.statusPollIntervalSeconds === 0) {
        const latest = await refreshAll({ quiet: true }).catch(() => null);
        if (latest?.status && isPodRunning(latest.status)) {
          addLog("再試行待ち中にPod状態 RUNNING を確認しました");
          return false;
        }
      }

      await wait(1000);
    }

    setRetryState((current) => ({ ...current, countdownSeconds: 0 }));
    return true;
  }, [addLog, launchConfig.statusPollIntervalSeconds, refreshAll]);

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
      addLog("ログインしました");
      await refreshAll();
    } catch {
      setLoginError("ログインに失敗しました。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleStart = async () => {
    cancelRetryRef.current = false;
    startFlowActiveRef.current = true;
    successNotifiedRef.current = false;
    setMode("retrying");
    setIsPolling(false);
    setMessage("Pod起動リトライを開始しました。");
    addLog("Pod起動リトライを開始しました");

    const maxAttempts = launchConfig.maxStartAttempts;
    setRetryState({
      active: true,
      attempt: 0,
      maxAttempts,
      countdownSeconds: null,
      lastStatus: null,
      lastError: ""
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (cancelRetryRef.current) {
        return;
      }

      const latest = await refreshAll({ quiet: true }).catch(() => null);
      if (latest?.status && isPodRunning(latest.status)) {
        addLog("Pod状態 RUNNING を確認しました");
        setMode("polling");
        setIsPolling(true);
        setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
        return;
      }

      setRetryState((current) => ({
        ...current,
        active: true,
        attempt,
        maxAttempts,
        countdownSeconds: null
      }));
      setMessage(`Pod起動要求を送信しています。試行 ${attempt} / ${maxAttempts}`);
      addLog(`再試行 ${attempt} / ${maxAttempts}`);
      addLog("Pod起動要求を送信しました");

      const result = await requestJson<RunpodActionResponse>("/api/runpod/start", {
        method: "POST"
      }).catch(() => ({
        status: 0,
        data: {
          ok: false,
          status: 0,
          retryable: true,
          retryAfterSeconds: launchConfig.startRetryIntervalSeconds,
          launchConfig,
          errorMessage: "Pod起動APIへ接続できませんでした。"
        } satisfies RunpodActionResponse
      }));

      applyLaunchConfig(result.data.launchConfig);

      if (result.data.ok) {
        addLog(result.data.message ?? "Pod起動要求を送信しました");
        setMessage("Pod起動要求を送信しました。状態確認へ移行します。");
        setMode("polling");
        setIsPolling(true);
        setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
        await refreshAll({ quiet: true }).catch(() => null);
        return;
      }

      const lastStatus = result.data.status ?? result.status;
      const lastError = result.data.errorMessage ?? "Pod起動に失敗しました。";
      setRetryState((current) => ({
        ...current,
        lastStatus,
        lastError
      }));
      addLog(`RunPod APIが${lastStatus || "不明"}を返しました`);
      addLog(lastError);

      if (!result.data.retryable) {
        setMode("idle");
        setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
        setMessage(lastError);
        startFlowActiveRef.current = false;
        return;
      }

      if (attempt >= maxAttempts) {
        setMode("idle");
        setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
        setMessage("最大試行回数に達しました。時間を置いて再試行してください。");
        addLog("最大試行回数に達しました");
        startFlowActiveRef.current = false;
        return;
      }

      const retryAfter = result.data.retryAfterSeconds ?? launchConfig.startRetryIntervalSeconds;
      setMessage(`${retryAfter}秒後に再試行します。`);
      addLog("GPU空き待ちの可能性があります");
      const shouldContinue = await waitForRetry(retryAfter);
      if (!shouldContinue) {
        if (cancelRetryRef.current) {
          return;
        }

        setMode("polling");
        setIsPolling(true);
        setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
        return;
      }
    }
  };

  const handleCancelRetry = () => {
    cancelRetryRef.current = true;
    startFlowActiveRef.current = false;
    setMode("idle");
    setIsPolling(false);
    setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
    setMessage("起動リトライを中止しました。");
    addLog("起動リトライを中止しました");
  };

  const handleStop = async () => {
    const ok = window.confirm("RunPod Podを停止します。生成中の処理は中断され、RunPod上のSD Mobile Controllerも開けなくなります。本当に停止しますか？");
    if (!ok) {
      addLog("Pod停止をキャンセルしました");
      return;
    }

    cancelRetryRef.current = true;
    startFlowActiveRef.current = false;
    successNotifiedRef.current = false;
    setMode("stopping");
    setIsPolling(false);
    setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
    setMessage("停止要求を送信しています。");
    addLog("停止要求を送信しました");

    const result = await requestJson<RunpodActionResponse>("/api/runpod/stop", {
      method: "POST"
    });
    if (!result.data.ok) {
      setMode("idle");
      const errorMessage = result.data.errorMessage ?? "Pod停止に失敗しました。";
      setMessage(errorMessage);
      addLog(errorMessage);
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
    cancelRetryRef.current = true;
    startFlowActiveRef.current = false;
    setAuthState("unauthenticated");
    setStatus(null);
    setHealth(null);
    setMessage("");
    setMode("idle");
    setIsPolling(false);
    setRetryState((current) => ({ ...current, active: false, countdownSeconds: null }));
  };

  const handleRequestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      addLog("このブラウザは通知に対応していません");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission);
    addLog(`通知許可状態: ${notificationLabel(permission)}`);
  };

  const handleNotificationTest = () => {
    if ("Notification" in window) {
      setNotificationState(Notification.permission);
      if (Notification.permission === "granted") {
        new Notification("RunPod通知テスト", {
          body: "通知、音、バイブのテストです。"
        });
        addLog("テスト通知を送信しました");
      } else {
        addLog("ブラウザ通知はまだ許可されていません");
      }
    } else {
      setNotificationState("unsupported");
      addLog("このブラウザは通知に対応していません");
    }

    if (playBeep()) {
      addLog("テスト音を再生しました");
    } else {
      addLog("このブラウザでは音通知を開始できませんでした");
    }

    if ("vibrate" in navigator) {
      navigator.vibrate([300, 150, 300]);
      addLog("テストバイブを実行しました");
    } else {
      addLog("この端末はバイブ通知に対応していません");
    }
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

          <Alert tone={running ? "warning" : "normal"}>
            RunPod実状態がRUNNINGの間は課金が継続します。使い終わったら必ずPod停止を押してください。
          </Alert>

          <div className="grid grid-cols-2 gap-2">
            <InfoPill label="Pod ID" value={status?.podId || "-"} />
            <InfoPill label="GPU" value={status?.gpuName || `${status?.gpuCount ?? 0} GPU`} />
            <InfoPill label="Pod実状態" value={String(status?.status ?? "-")} />
            <InfoPill label="last start" value={formatDate(status?.lastStartedAt)} />
          </div>

          {status && !status.ok ? <Alert tone="error">{status.errorMessage ?? "RunPod状態を取得できませんでした。"}</Alert> : null}
          {message ? <Alert tone={message.includes("失敗") || message.includes("未設定") || message.includes("最大") ? "error" : "normal"}>{message}</Alert> : null}
        </section>

        <section className="mobile-panel space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" disabled={isRefreshing} onClick={() => refreshAll()}>
              {isRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              状態更新
            </button>
            <button className="touch-button bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/25" disabled={mode === "retrying" || mode === "polling"} onClick={handleStart}>
              <Play size={16} />
              Pod起動
            </button>
            <button className="touch-button bg-red-500/10 text-red-200 ring-1 ring-red-500/25" disabled={mode === "stopping"} onClick={handleStop}>
              <Square size={15} />
              Pod停止
            </button>
            <button
              className="touch-button bg-cyanfire-500 text-slate-950"
              disabled={stopped || !controllerReady}
              onClick={() => window.open(appUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink size={16} />
              開く
            </button>
          </div>
          {mode === "retrying" || mode === "polling" ? (
            <button className="touch-button w-full bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/25" onClick={handleCancelRetry}>
              <XCircle size={16} />
              再試行を中止
            </button>
          ) : null}
        </section>

        <section className="mobile-panel space-y-3 p-4">
          <h2 className="section-title">起動リトライ</h2>
          <div className="grid grid-cols-2 gap-2">
            <InfoPill label="再試行" value={`${retryState.attempt} / ${retryState.maxAttempts}`} />
            <InfoPill label="次の再試行まで" value={retryState.countdownSeconds === null ? "-" : `${retryState.countdownSeconds}秒`} />
            <InfoPill label="最大待機" value={formatMaxWait(launchConfig)} />
            <InfoPill label="再試行間隔" value={`${launchConfig.startRetryIntervalSeconds}秒`} />
            <InfoPill label="確認間隔" value={`${launchConfig.statusPollIntervalSeconds}秒`} />
            <InfoPill label="最後のHTTP status" value={retryState.lastStatus === null ? "-" : String(retryState.lastStatus)} />
          </div>
          {retryState.active ? <StatusBadge label="起動リトライ中" className="border-cyanfire-500/30 bg-cyanfire-500/10 text-cyanfire-300" /> : null}
          {retryState.lastError ? <Alert tone="error">{retryState.lastError}</Alert> : null}
        </section>

        <section className="mobile-panel space-y-3 p-4">
          <h2 className="section-title">応答確認</h2>
          <HealthRow title="SD Mobile Controller" target={health?.app} />
          <HealthRow title="A1111 WebUI docs" target={health?.webuiDocs} />
          {controllerReady ? <Alert tone="normal">SD Mobile Controllerを開けます。</Alert> : null}
        </section>

        <section className="mobile-panel space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title">通知</h2>
            <StatusBadge
              label={notificationLabel(notificationState)}
              className={notificationState === "granted" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-500/30 bg-slate-500/10 text-slate-300"}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" disabled={notificationState === "unsupported"} onClick={handleRequestNotificationPermission}>
              <Bell size={16} />
              通知を許可
            </button>
            <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" onClick={handleNotificationTest}>
              <BellRing size={16} />
              通知テスト
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-[8px] bg-black/20 p-3 text-[12px] text-slate-400">
            <Volume2 size={15} className="shrink-0 text-cyanfire-300" />
            ブラウザ通知、短い通知音、スマホのバイブを起動完了時に試します。
          </div>
        </section>

        <section className="mobile-panel space-y-3 p-4">
          <h2 className="section-title">ログ</h2>
          <div className="max-h-[260px] space-y-2 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-[12px] text-slate-500">まだログはありません。</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="grid grid-cols-[64px_1fr] gap-2 rounded-[8px] bg-black/20 p-2 text-[12px] leading-relaxed">
                  <span className="font-bold text-slate-500">{log.time}</span>
                  <span className="text-slate-200">{log.message}</span>
                </div>
              ))
            )}
          </div>
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

function Alert({ tone, children }: { tone: "normal" | "warning" | "error"; children: ReactNode }) {
  const toneClass = {
    normal: "bg-cyanfire-500/10 text-cyanfire-100",
    warning: "bg-amber-400/12 text-amber-100 ring-1 ring-amber-300/20",
    error: "bg-red-500/10 text-red-100"
  }[tone];

  return (
    <p className={`rounded-[8px] p-3 text-[13px] leading-relaxed ${toneClass}`}>
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
          label={ok ? "応答OK" : "未応答"}
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
