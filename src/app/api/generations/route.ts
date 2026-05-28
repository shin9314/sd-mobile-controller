import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAuthResponse } from "@/lib/auth";
import { defaultAppSettings } from "@/lib/defaults";
import { normalizeGenerationInput } from "@/lib/normalizers";
import { prisma } from "@/lib/prisma";
import { toGenerationRecord } from "@/lib/serializers";
import { requestTxt2ImgGeneration, SdApiGenerationError } from "@/services/sdApiService";

export const runtime = "nodejs";

const GENERATED_DIR = path.join(process.cwd(), "storage", "generated");

function timestampForFilename() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .format(new Date())
    .replace(/[^\d]/g, "")
    .replace(/^(\d{8})(\d{6})$/, "$1_$2");
}

function stripImageBase64(value: string) {
  const marker = "base64,";
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

function seedFromInfo(infoText: string, fallback: number) {
  try {
    const parsed = JSON.parse(infoText) as { seed?: unknown; all_seeds?: unknown };
    if (typeof parsed.seed === "number") {
      return parsed.seed;
    }
    if (Array.isArray(parsed.all_seeds) && typeof parsed.all_seeds[0] === "number") {
      return parsed.all_seeds[0];
    }
  } catch {
    const match = infoText.match(/"seed"\s*:\s*(-?\d+)/);
    if (match) {
      return Number(match[1]);
    }
  }

  return fallback === -1 ? Math.floor(Math.random() * 2147483647) : fallback;
}

function errorResponse(error: unknown) {
  if (error instanceof SdApiGenerationError) {
    return NextResponse.json(
      {
        errorMessage: error.message,
        status: error.status,
        statusText: error.statusText,
        contentType: error.contentType,
        bodyPreview: error.bodyPreview
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { errorMessage: error instanceof Error ? error.message : "txt2img生成に失敗しました。" },
    { status: 400 }
  );
}

export async function GET() {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const generations = await prisma.generationHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json(generations.map(toGenerationRecord));
}

export async function POST(request: Request) {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await request.json()) as Record<string, unknown>;
  const settings = normalizeGenerationInput(body);
  const appSettings = await prisma.setting.findUnique({ where: { id: 1 } });
  const baseUrl = appSettings?.sdApiUrl || process.env.SD_API_BASE_URL || defaultAppSettings.sdApiUrl;

  if (!baseUrl.trim()) {
    return NextResponse.json({ errorMessage: "Stable Diffusion API URLが未設定です。設定画面でURLを保存してください。" }, { status: 400 });
  }

  if (appSettings?.sdApiLastOk !== true) {
    return NextResponse.json({ errorMessage: "SD API接続確認が完了していません。設定画面で接続OKを確認してから生成してください。" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof requestTxt2ImgGeneration>>;
  try {
    result = await requestTxt2ImgGeneration(settings, {
      baseUrl,
      auth: {
        user: appSettings?.sdApiBasicAuthUser || process.env.SD_API_BASIC_USER || "",
        password: appSettings?.sdApiBasicAuthPassword || process.env.SD_API_BASIC_PASSWORD || ""
      }
    });
  } catch (error) {
    return errorResponse(error);
  }

  await mkdir(GENERATED_DIR, { recursive: true });
  const actualSeed = seedFromInfo(result.info, settings.seed);
  const filename = `generated_${timestampForFilename()}_${actualSeed}.png`;
  const imageBuffer = Buffer.from(stripImageBase64(result.images[0]), "base64");
  await writeFile(path.join(GENERATED_DIR, filename), imageBuffer);

  const generation = await prisma.generationHistory.create({
    data: {
      imageUrl: `/api/generated/${filename}`,
      prompt: settings.prompt,
      negativePrompt: settings.negativePrompt,
      model: settings.model,
      vae: settings.vae,
      size: settings.size,
      count: settings.count,
      sampler: settings.sampler,
      steps: settings.steps,
      cfg: settings.cfg,
      seed: actualSeed,
      fixedSeed: settings.fixedSeed,
      lorasJson: JSON.stringify(settings.loras),
      controlNetJson: JSON.stringify(settings.controlNet),
      infoText: result.info
    }
  });

  return NextResponse.json(toGenerationRecord(generation), { status: 201 });
}
