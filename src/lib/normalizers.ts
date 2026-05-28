import { defaultAppSettings, defaultControlNet, defaultGenerationSettings } from "@/lib/defaults";
import type { AppSettings, ControlNetConfig, GenerationSettings, LoraItem } from "@/lib/types";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function nullableInt(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : null;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numericValue));
}

function intInRange(value: unknown, fallback: number, min: number, max: number) {
  return Math.round(numberInRange(value, fallback, min, max));
}

function normalizeLoras(value: unknown): LoraItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      id: text(item?.id, crypto.randomUUID()),
      name: text(item?.name, "quality_lora"),
      weight: numberInRange(item?.weight, 0.8, -2, 2)
    }))
    .slice(0, 8);
}

export function normalizeGenerationInput(input: Partial<GenerationSettings>): GenerationSettings {
  const controlNetInput: Partial<ControlNetConfig> =
    typeof input.controlNet === "object" && input.controlNet ? input.controlNet : {};

  return {
    prompt: text(input.prompt),
    negativePrompt: text(input.negativePrompt),
    model: text(input.model, defaultGenerationSettings.model),
    vae: text(input.vae, defaultGenerationSettings.vae),
    count: intInRange(input.count, defaultGenerationSettings.count, 1, 4),
    size: text(input.size, defaultGenerationSettings.size),
    sampler: text(input.sampler, defaultGenerationSettings.sampler),
    steps: intInRange(input.steps, defaultGenerationSettings.steps, 1, 80),
    cfg: numberInRange(input.cfg, defaultGenerationSettings.cfg, 1, 20),
    seed: intInRange(input.seed, defaultGenerationSettings.seed, -1, 2147483647),
    fixedSeed: Boolean(input.fixedSeed),
    loras: normalizeLoras(input.loras),
    controlNet: {
      ...defaultControlNet,
      ...controlNetInput,
      enabled: Boolean(controlNetInput.enabled),
      imageName: text(controlNetInput.imageName),
      weight: numberInRange(controlNetInput.weight, defaultControlNet.weight, 0, 2),
      start: numberInRange(controlNetInput.start, defaultControlNet.start, 0, 1),
      end: numberInRange(controlNetInput.end, defaultControlNet.end, 0, 1)
    }
  };
}

export function normalizeAppSettings(input: Partial<AppSettings>): AppSettings {
  const autoStopMinutes =
    input.autoStopMinutes === null
      ? null
      : input.autoStopMinutes === undefined
        ? defaultAppSettings.autoStopMinutes
      : intInRange(input.autoStopMinutes, 30, 15, 60);

  return {
    runpodApiKey: text(input.runpodApiKey),
    podId: text(input.podId),
    sdApiUrl: text(input.sdApiUrl),
    sdApiBasicAuthUser: text(input.sdApiBasicAuthUser, defaultAppSettings.sdApiBasicAuthUser),
    sdApiBasicAuthPassword: text(input.sdApiBasicAuthPassword, defaultAppSettings.sdApiBasicAuthPassword),
    sdApiLastCheckedAt: nullableText(input.sdApiLastCheckedAt),
    sdApiLastOk: nullableBoolean(input.sdApiLastOk),
    sdApiLastError: nullableText(input.sdApiLastError),
    sdApiCurrentModel: nullableText(input.sdApiCurrentModel),
    sdApiModelCount: nullableInt(input.sdApiModelCount),
    sdApiSamplerCount: nullableInt(input.sdApiSamplerCount),
    autoStopMinutes
  };
}
