import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { normalizeGenerationInput } from "@/lib/normalizers";
import { prisma } from "@/lib/prisma";
import { toPresetRecord } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET() {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const presets = await prisma.preset.findMany({
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json(presets.map(toPresetRecord));
}

export async function POST(request: Request) {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await request.json()) as Record<string, unknown>;
  const settings = normalizeGenerationInput(body);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "無題プリセット";

  const preset = await prisma.preset.create({
    data: {
      name,
      prompt: settings.prompt,
      negativePrompt: settings.negativePrompt,
      model: settings.model,
      vae: settings.vae,
      size: settings.size,
      count: settings.count,
      sampler: settings.sampler,
      steps: settings.steps,
      cfg: settings.cfg,
      seed: settings.seed,
      fixedSeed: settings.fixedSeed,
      lorasJson: JSON.stringify(settings.loras),
      controlNetJson: JSON.stringify(settings.controlNet)
    }
  });

  return NextResponse.json(toPresetRecord(preset), { status: 201 });
}
