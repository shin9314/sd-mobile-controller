import type { GenerationHistory, Preset, Setting } from "@prisma/client";
import { defaultControlNet } from "@/lib/defaults";
import type { AppSettings, ControlNetConfig, GenerationRecord, LoraItem, PresetRecord } from "@/lib/types";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toPresetRecord(row: Preset): PresetRecord {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    negativePrompt: row.negativePrompt,
    model: row.model,
    vae: row.vae,
    size: row.size,
    count: row.count,
    sampler: row.sampler,
    steps: row.steps,
    cfg: row.cfg,
    seed: row.seed,
    fixedSeed: row.fixedSeed,
    loras: parseJson<LoraItem[]>(row.lorasJson, []),
    controlNet: parseJson<ControlNetConfig>(row.controlNetJson, defaultControlNet),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function toGenerationRecord(row: GenerationHistory): GenerationRecord {
  return {
    id: row.id,
    imageUrl: row.imageUrl,
    prompt: row.prompt,
    negativePrompt: row.negativePrompt,
    model: row.model,
    vae: row.vae,
    size: row.size,
    count: row.count,
    sampler: row.sampler,
    steps: row.steps,
    cfg: row.cfg,
    seed: row.seed,
    fixedSeed: row.fixedSeed,
    loras: parseJson<LoraItem[]>(row.lorasJson, []),
    controlNet: parseJson<ControlNetConfig>(row.controlNetJson, defaultControlNet),
    infoText: row.infoText,
    createdAt: row.createdAt.toISOString()
  };
}

export function toAppSettings(row: Setting): AppSettings {
  return {
    runpodApiKey: row.runpodApiKey,
    podId: row.podId,
    sdApiUrl: row.sdApiUrl,
    sdApiBasicAuthUser: row.sdApiBasicAuthUser,
    sdApiBasicAuthPassword: row.sdApiBasicAuthPassword,
    sdApiLastCheckedAt: row.sdApiLastCheckedAt?.toISOString() ?? null,
    sdApiLastOk: row.sdApiLastOk,
    sdApiLastError: row.sdApiLastError,
    sdApiCurrentModel: row.sdApiCurrentModel,
    sdApiModelCount: row.sdApiModelCount,
    sdApiSamplerCount: row.sdApiSamplerCount,
    autoStopMinutes: row.autoStopMinutes
  };
}
