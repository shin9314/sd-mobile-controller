import type { ControlNetApiCheckResult, GenerationSettings, SdApiCheckResult, SdEndpointDebug } from "@/lib/types";

const dummyImages = [
  "/mock/dummy-01.svg",
  "/mock/dummy-02.svg",
  "/mock/dummy-03.svg",
  "/mock/dummy-04.svg"
];

type SdApiAuth = {
  user?: string;
  password?: string;
};

type EndpointResult =
  | {
      ok: true;
      data: unknown;
      debug: SdEndpointDebug;
    }
  | {
      ok: false;
      errorMessage: string;
      debug: SdEndpointDebug;
    };

const SD_API_TIMEOUT_MS = 8000;
const SD_ENDPOINTS = {
  options: "/sdapi/v1/options",
  models: "/sdapi/v1/sd-models",
  samplers: "/sdapi/v1/samplers",
  vaes: "/sdapi/v1/sd-vae",
  loras: "/sdapi/v1/loras",
  controlNetVersion: "/controlnet/version",
  controlNetModels: "/controlnet/model_list",
  controlNetModules: "/controlnet/module_list"
} as const;

export function normalizeSdApiUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");

  if (!trimmed) {
    throw new Error("Stable Diffusion API URLを入力してください。");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Stable Diffusion API URLの形式が不正です。http:// または https:// から入力してください。");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Stable Diffusion API URLは http:// または https:// から入力してください。");
  }

  return trimmed;
}

function authHeaders(auth?: SdApiAuth): HeadersInit {
  const user = auth?.user?.trim();
  const password = auth?.password?.trim();

  if (!user || !password) {
    return { Accept: "application/json" };
  }

  return {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
  };
}

function createDebug(endpoint: string, url: string): SdEndpointDebug {
  return {
    endpoint,
    url,
    ok: false,
    status: null,
    statusText: "",
    contentType: null,
    bodyPreview: ""
  };
}

function failEndpoint(debug: SdEndpointDebug, errorMessage: string): EndpointResult {
  return {
    ok: false,
    errorMessage,
    debug: {
      ...debug,
      ok: false,
      errorMessage
    }
  };
}

function messageForHttpError(path: string, status: number) {
  if (status === 401 || status === 403) {
    return "Basic認証に失敗しました。SD API Basic Auth User / Password を確認してください。";
  }

  if (path === SD_ENDPOINTS.options && status === 404) {
    return "/sdapi/v1/options が404です。Stable Diffusion WebUIを --api 有効で起動しているか、入力URLを確認してください。";
  }

  if (status === 404) {
    return `${path} が404です。Stable Diffusion APIのURLと拡張機能の有効状態を確認してください。`;
  }

  return `${path} がHTTP ${status}を返しました。Stable Diffusion APIの起動状態を確認してください。`;
}

function messageForFetchError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Stable Diffusion APIへの接続がタイムアウトしました。URL、RunPod Proxy、WebUIの起動状態を確認してください。";
  }

  if (error instanceof TypeError) {
    return "Stable Diffusion APIに接続できません。WebUIが起動しているか、URLとネットワーク状態を確認してください。";
  }

  return error instanceof Error ? error.message : "Stable Diffusion APIへの接続に失敗しました。";
}

async function fetchJsonEndpoint(baseUrl: string, endpoint: string, auth?: SdApiAuth): Promise<EndpointResult> {
  const url = `${baseUrl}${endpoint}`;
  const debug = createDebug(endpoint, url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SD_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: authHeaders(auth),
      signal: controller.signal,
      cache: "no-store"
    });
    debug.status = response.status;
    debug.statusText = response.statusText;
    debug.contentType = response.headers.get("content-type");

    const body = await response.text();
    debug.bodyPreview = body.slice(0, 500);

    let data: unknown = null;
    try {
      data = JSON.parse(body);
    } catch (error) {
      debug.parseError = error instanceof Error ? error.message : "JSON.parseに失敗しました。";
    }

    if (!response.ok) {
      return failEndpoint(debug, messageForHttpError(endpoint, response.status));
    }

    if (debug.parseError) {
      return failEndpoint(debug, `${endpoint} のレスポンスJSONを読み取れませんでした。`);
    }

    return {
      ok: true,
      data,
      debug: {
        ...debug,
        ok: true
      }
    };
  } catch (error) {
    return failEndpoint(debug, messageForFetchError(error));
  } finally {
    clearTimeout(timeout);
  }
}

function assertObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} のレスポンス形式が想定外です。`);
  }

  return value as Record<string, unknown>;
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} のレスポンス形式が想定外です。`);
  }

  return value;
}

function optionalArray(result: EndpointResult, path: string, warnings: string[]) {
  if (!result.ok) {
    warnings.push(`${path} は取得できませんでした: ${result.errorMessage}`);
    return [];
  }

  try {
    return assertArray(result.data, path);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : `${path} のレスポンス形式が想定外です。`);
    return [];
  }
}

function firstString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "string" && field.trim()) {
      return field;
    }
    if (typeof field === "number") {
      return String(field);
    }
  }

  return "";
}

function namesFromArray(value: unknown[], keys: string[]) {
  const names = value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return "";
      }
      return firstString(item as Record<string, unknown>, keys);
    })
    .filter(Boolean);

  return Array.from(new Set(names));
}

function listFromControlNetPayload(value: unknown, key: string) {
  if (Array.isArray(value)) {
    return namesFromArray(value, ["name", "title", "model_name", "module", "value"]);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const list = (value as Record<string, unknown>)[key];
  return Array.isArray(list) ? namesFromArray(list, ["name", "title", "model_name", "module", "value"]) : [];
}

async function checkControlNetConnection(baseUrl: string, auth?: SdApiAuth): Promise<ControlNetApiCheckResult> {
  const startedAt = Date.now();
  const [versionResult, modelsResult, modulesResult] = await Promise.all([
    fetchJsonEndpoint(baseUrl, SD_ENDPOINTS.controlNetVersion, auth),
    fetchJsonEndpoint(baseUrl, SD_ENDPOINTS.controlNetModels, auth),
    fetchJsonEndpoint(baseUrl, SD_ENDPOINTS.controlNetModules, auth)
  ]);
  const latencyMs = Date.now() - startedAt;
  const endpointResults = [versionResult.debug, modelsResult.debug, modulesResult.debug];

  const failed = [versionResult, modelsResult, modulesResult].find((result) => !result.ok);
  if (failed && !failed.ok) {
    return {
      ok: false,
      latencyMs,
      errorMessage: failed.errorMessage,
      endpointResults
    };
  }

  const versionPayload = versionResult.ok && versionResult.data && typeof versionResult.data === "object"
    ? versionResult.data as Record<string, unknown>
    : {};
  const version = firstString(versionPayload, ["version", "controlnet_version"]) || "不明";
  const models = modelsResult.ok ? listFromControlNetPayload(modelsResult.data, "model_list") : [];
  const modules = modulesResult.ok ? listFromControlNetPayload(modulesResult.data, "module_list") : [];

  return {
    ok: true,
    latencyMs,
    version,
    modelCount: models.length,
    moduleCount: modules.length,
    models,
    modules,
    endpointResults
  };
}

export async function checkSdApiConnection(baseUrl: string, auth?: SdApiAuth): Promise<SdApiCheckResult> {
  const startedAt = Date.now();
  let normalizedBaseUrl = "";

  try {
    normalizedBaseUrl = normalizeSdApiUrl(baseUrl);
  } catch (error) {
    return {
      ok: false,
      baseUrl: baseUrl.trim(),
      latencyMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "Stable Diffusion API URLを確認してください。",
      endpointResults: []
    };
  }

  const [optionsResult, modelsResult, samplersResult, vaesResult, lorasResult, controlNetResult] = await Promise.all([
    fetchJsonEndpoint(normalizedBaseUrl, SD_ENDPOINTS.options, auth),
    fetchJsonEndpoint(normalizedBaseUrl, SD_ENDPOINTS.models, auth),
    fetchJsonEndpoint(normalizedBaseUrl, SD_ENDPOINTS.samplers, auth),
    fetchJsonEndpoint(normalizedBaseUrl, SD_ENDPOINTS.vaes, auth),
    fetchJsonEndpoint(normalizedBaseUrl, SD_ENDPOINTS.loras, auth),
    checkControlNetConnection(normalizedBaseUrl, auth)
  ]);

  const latencyMs = Date.now() - startedAt;
  const warnings: string[] = [];
  const requiredResults = [optionsResult, modelsResult, samplersResult];
  const endpointResults = [
    optionsResult.debug,
    modelsResult.debug,
    samplersResult.debug,
    vaesResult.debug,
    lorasResult.debug,
    ...controlNetResult.endpointResults
  ];
  const requiredFailure = requiredResults.find((result) => !result.ok);

  if (!vaesResult.ok) {
    warnings.push(`VAE一覧は取得できませんでした: ${vaesResult.errorMessage}`);
  }
  if (!lorasResult.ok) {
    warnings.push(`LoRA一覧は取得できませんでした: ${lorasResult.errorMessage}`);
  }
  if (!controlNetResult.ok) {
    warnings.push(`ControlNet APIは確認できませんでした: ${controlNetResult.errorMessage}`);
  }

  if (requiredFailure && !requiredFailure.ok) {
    return {
      ok: false,
      baseUrl: normalizedBaseUrl,
      latencyMs,
      errorMessage: requiredFailure.errorMessage,
      endpointResults,
      controlNet: controlNetResult,
      warnings
    };
  }

  try {
    const options = assertObject(optionsResult.ok ? optionsResult.data : null, SD_ENDPOINTS.options);
    const modelItems = assertArray(modelsResult.ok ? modelsResult.data : null, SD_ENDPOINTS.models);
    const samplerItems = assertArray(samplersResult.ok ? samplersResult.data : null, SD_ENDPOINTS.samplers);
    const vaeItems = optionalArray(vaesResult, SD_ENDPOINTS.vaes, warnings);
    const loraItems = optionalArray(lorasResult, SD_ENDPOINTS.loras, warnings);
    const models = namesFromArray(modelItems, ["title", "model_name", "name", "filename"]);
    const samplers = namesFromArray(samplerItems, ["name", "title"]);
    const vaes = namesFromArray(vaeItems, ["model_name", "name", "filename"]);
    const loras = namesFromArray(loraItems, ["name", "alias", "filename"]);
    const currentModel =
      firstString(options, ["sd_model_checkpoint", "sd_checkpoint", "sd_model"]) ||
      models[0] ||
      "不明";

    return {
      ok: true,
      baseUrl: normalizedBaseUrl,
      latencyMs,
      currentModel,
      modelCount: models.length,
      samplerCount: samplers.length,
      vaeCount: vaes.length,
      loraCount: loras.length,
      models,
      samplers,
      vaes,
      loras,
      controlNet: controlNetResult,
      endpointResults,
      warnings
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl: normalizedBaseUrl,
      latencyMs,
      errorMessage: error instanceof Error ? error.message : "Stable Diffusion APIのレスポンス解析に失敗しました。",
      endpointResults,
      controlNet: controlNetResult,
      warnings
    };
  }
}

export async function requestDummyGeneration(settings: GenerationSettings) {
  const seedBasis = settings.seed === -1 ? Date.now() : settings.seed;
  const imageUrl = dummyImages[Math.abs(seedBasis) % dummyImages.length];

  return {
    imageUrl,
    message: "ダミー画像を作成しました"
  };
}
