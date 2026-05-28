import type { AppSettings, GenerationRecord, GenerationSettings, PresetRecord, SdApiCheckResult } from "@/lib/types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { errorMessage?: string; bodyPreview?: string } | null;
    const details = body?.bodyPreview ? `\n${body.bodyPreview}` : "";
    throw new Error(`${body?.errorMessage ?? `Request failed: ${response.status}`}${details}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getSession: () => requestJson<{ authenticated: boolean }>("/api/auth/session"),
  login: (user: string, password: string) =>
    requestJson<{ ok: true }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ user, password })
    }),
  logout: () =>
    requestJson<{ ok: true }>("/api/auth/logout", {
      method: "POST"
    }),
  getSettings: () => requestJson<AppSettings>("/api/settings"),
  saveSettings: (settings: AppSettings) =>
    requestJson<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings)
    }),
  checkSdApi: async (settings: Pick<AppSettings, "sdApiUrl" | "sdApiBasicAuthUser" | "sdApiBasicAuthPassword">) => {
    const response = await fetch("/api/sd/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apiUrl: settings.sdApiUrl,
        sdApiBasicAuthUser: settings.sdApiBasicAuthUser,
        sdApiBasicAuthPassword: settings.sdApiBasicAuthPassword
      })
    });

    try {
      return await response.json() as SdApiCheckResult;
    } catch {
      return {
        ok: false,
        baseUrl: settings.sdApiUrl,
        latencyMs: 0,
        errorMessage: "接続確認結果を読み取れませんでした。",
        endpointResults: []
      } satisfies SdApiCheckResult;
    }
  },
  getPresets: () => requestJson<PresetRecord[]>("/api/presets"),
  createPreset: (name: string, settings: GenerationSettings) =>
    requestJson<PresetRecord>("/api/presets", {
      method: "POST",
      body: JSON.stringify({ name, ...settings })
    }),
  deletePreset: (id: string) =>
    requestJson<{ ok: true }>(`/api/presets/${id}`, {
      method: "DELETE"
    }),
  getGenerations: () => requestJson<GenerationRecord[]>("/api/generations"),
  createGeneration: (settings: GenerationSettings) =>
    requestJson<GenerationRecord>("/api/generations", {
      method: "POST",
      body: JSON.stringify(settings)
    }),
  deleteGeneration: (id: string) =>
    requestJson<{ ok: true }>(`/api/generations/${id}`, {
      method: "DELETE"
    })
};
