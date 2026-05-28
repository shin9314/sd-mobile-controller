import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { normalizeGenerationInput } from "@/lib/normalizers";
import { prisma } from "@/lib/prisma";
import { toGenerationRecord } from "@/lib/serializers";
import { requestDummyGeneration } from "@/services/sdApiService";

export const runtime = "nodejs";

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
  const result = await requestDummyGeneration(settings);

  const generation = await prisma.generationHistory.create({
    data: {
      imageUrl: result.imageUrl,
      prompt: settings.prompt,
      negativePrompt: settings.negativePrompt,
      model: settings.model,
      vae: settings.vae,
      size: settings.size,
      count: settings.count,
      sampler: settings.sampler,
      steps: settings.steps,
      cfg: settings.cfg,
      seed: settings.seed === -1 ? Math.floor(Math.random() * 2147483647) : settings.seed,
      fixedSeed: settings.fixedSeed,
      lorasJson: JSON.stringify(settings.loras),
      controlNetJson: JSON.stringify(settings.controlNet)
    }
  });

  return NextResponse.json(toGenerationRecord(generation), { status: 201 });
}
