import type { AppSettings, ControlNetConfig, GenerationSettings, LoraItem } from "@/lib/types";

export const modelOptions = ["SDXL Base", "Anime SDXL", "Realistic SDXL"];
export const vaeOptions = ["Automatic", "sdxl_vae.safetensors"];
export const sizeOptions = ["768x1024", "1024x1024", "832x1216", "1080x1080"];
export const samplerOptions = ["DPM++ 2M Karras", "Euler a", "UniPC"];
export const loraOptions = ["quality_lora", "swimsuit_texture", "background_realistic"];
export const controlNetTypes: ControlNetConfig["type"][] = ["Canny", "Depth", "OpenPose", "Lineart"];

export const defaultControlNet: ControlNetConfig = {
  enabled: false,
  imageName: "",
  type: "Canny",
  weight: 0.8,
  start: 0,
  end: 1
};

export const defaultGenerationSettings: GenerationSettings = {
  prompt: "",
  negativePrompt: "",
  model: "SDXL Base",
  vae: "Automatic",
  count: 1,
  size: "768x1024",
  sampler: "DPM++ 2M Karras",
  steps: 20,
  cfg: 7,
  seed: -1,
  fixedSeed: false,
  loras: [],
  controlNet: defaultControlNet
};

export const defaultAppSettings: AppSettings = {
  runpodApiKey: "",
  podId: "",
  sdApiUrl: "http://127.0.0.1:17860",
  sdApiBasicAuthUser: "",
  sdApiBasicAuthPassword: "",
  sdApiLastCheckedAt: null,
  sdApiLastOk: null,
  sdApiLastError: null,
  sdApiCurrentModel: null,
  sdApiModelCount: null,
  sdApiSamplerCount: null,
  autoStopMinutes: 30
};

export function createDefaultLora(name = loraOptions[0]): LoraItem {
  return {
    id: crypto.randomUUID(),
    name,
    weight: 0.8
  };
}
