const RUNPOD_REST_BASE_URL = "https://rest.runpod.io/v1";
const NEXT_CHECK_AFTER_SECONDS = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 8_000;

const DEFAULT_START_RETRY_INTERVAL_SECONDS = 8;
const DEFAULT_MAX_START_ATTEMPTS = 150;
const DEFAULT_STATUS_POLL_INTERVAL_SECONDS = 5;

type RunpodConfig =
  | {
      ok: true;
      apiKey: string;
      podId: string;
      appUrl: string;
      webuiUrl: string;
    }
  | {
      ok: false;
      errorMessage: string;
      missing: string[];
      appUrl: string;
      webuiUrl: string;
    };

type JsonRecord = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectValue(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function intEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRunpodLaunchConfig() {
  return {
    startRetryIntervalSeconds: intEnv("RUNPOD_START_RETRY_INTERVAL_SECONDS", DEFAULT_START_RETRY_INTERVAL_SECONDS),
    maxStartAttempts: intEnv("RUNPOD_START_MAX_ATTEMPTS", DEFAULT_MAX_START_ATTEMPTS),
    statusPollIntervalSeconds: intEnv("RUNPOD_STATUS_POLL_INTERVAL_SECONDS", DEFAULT_STATUS_POLL_INTERVAL_SECONDS)
  };
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout)
  };
}

async function readJsonResponse(response: Response) {
  const body = await response.text();
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return { bodyPreview: body.slice(0, 500) };
  }
}

export function getRunpodConfig(): RunpodConfig {
  const apiKey = process.env.RUNPOD_API_KEY?.trim() ?? "";
  const podId = process.env.RUNPOD_POD_ID?.trim() ?? "";
  const appUrl = process.env.RUNPOD_APP_URL?.trim() ?? "";
  const webuiUrl = process.env.RUNPOD_WEBUI_URL?.trim() ?? "";
  const missing = [
    apiKey ? "" : "RUNPOD_API_KEY",
    podId ? "" : "RUNPOD_POD_ID"
  ].filter(Boolean);

  if (missing.length > 0) {
    return {
      ok: false,
      errorMessage: `${missing.join(" / ")} が未設定です。.env を確認してください。`,
      missing,
      appUrl,
      webuiUrl
    };
  }

  return {
    ok: true,
    apiKey,
    podId,
    appUrl,
    webuiUrl
  };
}

function sanitizeGpu(gpu: unknown) {
  const value = objectValue(gpu);
  if (!value) {
    return null;
  }

  return {
    id: text(value.id),
    count: numberValue(value.count) ?? 0,
    displayName: text(value.displayName)
  };
}

function sanitizeMachine(machine: unknown) {
  const value = objectValue(machine);
  if (!value) {
    return null;
  }

  return {
    id: text(value.id),
    gpuDisplayName: text(value.gpuDisplayName),
    dataCenterId: text(value.dataCenterId)
  };
}

export function sanitizePodResponse(raw: unknown) {
  const pod = objectValue(raw) ?? {};
  const gpu = sanitizeGpu(pod.gpu);
  const machine = sanitizeMachine(pod.machine);
  const desiredStatus = text(pod.desiredStatus);
  const status = text(pod.status) || text(pod.runtimeStatus) || desiredStatus || "UNKNOWN";

  return {
    podId: text(pod.id),
    name: text(pod.name),
    status,
    desiredStatus,
    machineId: text(pod.machineId) || machine?.id || "",
    gpuCount: gpu?.count ?? numberValue(pod.gpuCount) ?? 0,
    gpuName: gpu?.displayName || machine?.gpuDisplayName || "",
    lastStartedAt: text(pod.lastStartedAt),
    lastStatusChange: text(pod.lastStatusChange),
    raw: {
      id: text(pod.id),
      name: text(pod.name),
      desiredStatus,
      status,
      machineId: text(pod.machineId) || machine?.id || "",
      gpu,
      machine,
      ports: arrayValue(pod.ports).filter((port) => typeof port === "string"),
      portMappings: objectValue(pod.portMappings) ?? {},
      publicIp: text(pod.publicIp)
    }
  };
}

function runpodErrorMessage(status: number) {
  if ([500, 502, 503, 504].includes(status)) {
    return `RunPod側で起動に失敗しました。GPU空き待ちの可能性があります。${DEFAULT_START_RETRY_INTERVAL_SECONDS}秒後に再試行します。`;
  }

  if (status === 401 || status === 403) {
    return "RunPod API Keyまたは権限を確認してください。";
  }

  if (status === 404) {
    return "RunPod Pod IDが見つかりません。RUNPOD_POD_IDを確認してください。";
  }

  if (status === 400) {
    return "RunPod APIへのリクエスト形式を確認してください。";
  }

  return `RunPod APIがHTTP ${status}を返しました。`;
}

async function runpodRequest(path: string, init?: RequestInit) {
  const config = getRunpodConfig();
  if (!config.ok) {
    return {
      ok: false as const,
      status: 400,
      retryable: false,
      errorMessage: config.errorMessage,
      missing: config.missing,
      appUrl: config.appUrl,
      webuiUrl: config.webuiUrl,
      launchConfig: getRunpodLaunchConfig()
    };
  }

  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${RUNPOD_REST_BASE_URL}${path}`, {
      ...init,
      signal: timeout.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...init?.headers
      }
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        retryable: false,
        errorMessage: runpodErrorMessage(response.status),
        body,
        appUrl: config.appUrl,
        webuiUrl: config.webuiUrl,
        launchConfig: getRunpodLaunchConfig()
      };
    }

    return {
      ok: true as const,
      status: response.status,
      body,
      config
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false as const,
      status: 0,
      retryable: false,
      errorMessage: isAbort
        ? "RunPod APIへの接続がタイムアウトしました。"
        : "RunPod APIへ接続できませんでした。",
      appUrl: config.appUrl,
      webuiUrl: config.webuiUrl,
      launchConfig: getRunpodLaunchConfig()
    };
  } finally {
    timeout.cleanup();
  }
}

export async function getRunpodStatus() {
  const config = getRunpodConfig();
  if (!config.ok) {
    return {
      ok: false as const,
      status: 400,
      retryable: false,
      errorMessage: config.errorMessage,
      missing: config.missing,
      appUrl: config.appUrl,
      webuiUrl: config.webuiUrl,
      launchConfig: getRunpodLaunchConfig()
    };
  }

  const result = await runpodRequest(`/pods/${encodeURIComponent(config.podId)}?includeMachine=true`);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true as const,
    ...sanitizePodResponse(result.body),
    appUrl: result.config.appUrl,
    webuiUrl: result.config.webuiUrl,
    launchConfig: getRunpodLaunchConfig()
  };
}

export async function startRunpodPod() {
  const config = getRunpodConfig();
  const launchConfig = getRunpodLaunchConfig();
  if (!config.ok) {
    return {
      ok: false as const,
      status: 400,
      retryable: false,
      errorMessage: config.errorMessage,
      missing: config.missing,
      appUrl: config.appUrl,
      webuiUrl: config.webuiUrl,
      launchConfig
    };
  }

  const result = await runpodRequest(`/pods/${encodeURIComponent(config.podId)}/start`, {
    method: "POST"
  });
  if (!result.ok) {
    const retryable = [500, 502, 503, 504].includes(result.status);
    return {
      ...result,
      retryable,
      retryAfterSeconds: retryable ? launchConfig.startRetryIntervalSeconds : undefined,
      errorMessage: retryable
        ? `RunPod側で起動に失敗しました。GPU空き待ちの可能性があります。${launchConfig.startRetryIntervalSeconds}秒後に再試行します。`
        : result.errorMessage,
      launchConfig
    };
  }

  return {
    ok: true as const,
    status: result.status,
    retryable: false,
    podId: config.podId,
    message: "Pod起動要求を送信しました。",
    nextCheckAfterSeconds: NEXT_CHECK_AFTER_SECONDS,
    appUrl: config.appUrl,
    webuiUrl: config.webuiUrl,
    launchConfig,
    raw: objectValue(result.body) ? sanitizePodResponse(result.body).raw : {}
  };
}

export async function stopRunpodPod() {
  const config = getRunpodConfig();
  if (!config.ok) {
    return {
      ok: false as const,
      status: 400,
      retryable: false,
      errorMessage: config.errorMessage,
      missing: config.missing,
      appUrl: config.appUrl,
      webuiUrl: config.webuiUrl,
      launchConfig: getRunpodLaunchConfig()
    };
  }

  const result = await runpodRequest(`/pods/${encodeURIComponent(config.podId)}/stop`, {
    method: "POST"
  });
  if (!result.ok) {
    return {
      ...result,
      retryable: false
    };
  }

  return {
    ok: true as const,
    status: result.status,
    retryable: false,
    podId: config.podId,
    message: "停止要求を送信しました。",
    nextCheckAfterSeconds: NEXT_CHECK_AFTER_SECONDS,
    appUrl: config.appUrl,
    webuiUrl: config.webuiUrl,
    launchConfig: getRunpodLaunchConfig(),
    raw: objectValue(result.body) ? sanitizePodResponse(result.body).raw : {}
  };
}

function appendPath(baseUrl: string, path: string) {
  if (!baseUrl) {
    return "";
  }

  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function checkHttpTarget(label: string, url: string) {
  if (!url) {
    return {
      label,
      url,
      ok: false,
      status: null,
      contentType: null,
      errorMessage: `${label} URLが未設定です。`
    };
  }

  const timeout = withTimeout(HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: timeout.signal
    });
    const contentType = response.headers.get("content-type");
    const body = await response.text();
    const preview = body.slice(0, 500);
    const lowerPreview = preview.trimStart().toLowerCase();
    const looksHtml = lowerPreview.startsWith("<!doctype")
      || lowerPreview.startsWith("<html")
      || (contentType ?? "").toLowerCase().includes("text/html");

    return {
      label,
      url,
      ok: response.ok || looksHtml,
      status: response.status,
      contentType,
      bodyPreview: preview,
      errorMessage: response.ok || looksHtml ? null : `${label} は応答しましたが、HTTP ${response.status} でした。`
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";

    return {
      label,
      url,
      ok: false,
      status: null,
      contentType: null,
      bodyPreview: "",
      errorMessage: isAbort ? `${label} の応答確認がタイムアウトしました。` : `${label} に接続できませんでした。`
    };
  } finally {
    timeout.cleanup();
  }
}

export async function checkRunpodHealth() {
  const appUrl = process.env.RUNPOD_APP_URL?.trim() ?? "";
  const webuiUrl = process.env.RUNPOD_WEBUI_URL?.trim() ?? "";
  const [app, webuiDocs] = await Promise.all([
    checkHttpTarget("SD Mobile Controller", appUrl),
    checkHttpTarget("A1111 WebUI docs", appendPath(webuiUrl, "/docs"))
  ]);

  return {
    ok: app.ok,
    appUrl,
    webuiUrl,
    app,
    webuiDocs,
    launchConfig: getRunpodLaunchConfig()
  };
}
