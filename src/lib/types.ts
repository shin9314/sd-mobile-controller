export type PodStatus = "停止中" | "起動中" | "生成中";
export type ApiStatus = "未接続" | "接続OK" | "接続失敗";
export type Screen = "generate" | "gallery" | "presets" | "settings";

export type LoraItem = {
  id: string;
  name: string;
  weight: number;
};

export type ControlNetConfig = {
  enabled: boolean;
  imageName: string;
  type: "Canny" | "Depth" | "OpenPose" | "Lineart";
  weight: number;
  start: number;
  end: number;
};

export type GenerationSettings = {
  prompt: string;
  negativePrompt: string;
  model: string;
  vae: string;
  count: number;
  size: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  fixedSeed: boolean;
  loras: LoraItem[];
  controlNet: ControlNetConfig;
};

export type PresetRecord = GenerationSettings & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerationRecord = GenerationSettings & {
  id: string;
  imageUrl: string;
  createdAt: string;
};

export type AppSettings = {
  runpodApiKey: string;
  podId: string;
  sdApiUrl: string;
  sdApiBasicAuthUser: string;
  sdApiBasicAuthPassword: string;
  sdApiLastCheckedAt: string | null;
  sdApiLastOk: boolean | null;
  sdApiLastError: string | null;
  sdApiCurrentModel: string | null;
  sdApiModelCount: number | null;
  sdApiSamplerCount: number | null;
  autoStopMinutes: number | null;
};

export type SdEndpointDebug = {
  endpoint: string;
  url: string;
  ok: boolean;
  status: number | null;
  statusText: string;
  contentType: string | null;
  bodyPreview: string;
  parseError?: string;
  errorMessage?: string;
};

export type ControlNetApiCheckResult =
  | {
      ok: true;
      latencyMs: number;
      version: string;
      modelCount: number;
      moduleCount: number;
      models: string[];
      modules: string[];
      endpointResults: SdEndpointDebug[];
    }
  | {
      ok: false;
      latencyMs: number;
      errorMessage: string;
      endpointResults: SdEndpointDebug[];
    };

export type SdApiCheckResult =
  | {
      ok: true;
      baseUrl: string;
      latencyMs: number;
      currentModel: string;
      modelCount: number;
      samplerCount: number;
      vaeCount: number;
      loraCount: number;
      models: string[];
      samplers: string[];
      vaes: string[];
      loras: string[];
      controlNet: ControlNetApiCheckResult;
      endpointResults: SdEndpointDebug[];
      warnings?: string[];
    }
  | {
      ok: false;
      baseUrl: string;
      latencyMs: number;
      errorMessage: string;
      endpointResults: SdEndpointDebug[];
      controlNet?: ControlNetApiCheckResult;
      warnings?: string[];
    };
