import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { defaultAppSettings } from "@/lib/defaults";
import { normalizeAppSettings } from "@/lib/normalizers";
import { prisma } from "@/lib/prisma";
import { toAppSettings } from "@/lib/serializers";

export const runtime = "nodejs";

const defaultSettingsData = {
  id: 1,
  runpodApiKey: defaultAppSettings.runpodApiKey,
  podId: defaultAppSettings.podId,
  sdApiUrl: process.env.SD_API_BASE_URL || defaultAppSettings.sdApiUrl,
  sdApiBasicAuthUser: process.env.SD_API_BASIC_USER || defaultAppSettings.sdApiBasicAuthUser,
  sdApiBasicAuthPassword: process.env.SD_API_BASIC_PASSWORD || defaultAppSettings.sdApiBasicAuthPassword,
  autoStopMinutes: defaultAppSettings.autoStopMinutes
};

export async function GET() {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const existing = await prisma.setting.findUnique({
    where: { id: 1 }
  });
  const settings =
    existing ??
    await prisma.setting.create({
      data: defaultSettingsData
    });

  return NextResponse.json(toAppSettings(settings));
}

export async function PUT(request: Request) {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await request.json()) as Record<string, unknown>;
  const data = normalizeAppSettings(body);
  const editableData = {
    runpodApiKey: data.runpodApiKey,
    podId: data.podId,
    sdApiUrl: data.sdApiUrl,
    sdApiBasicAuthUser: data.sdApiBasicAuthUser,
    sdApiBasicAuthPassword: data.sdApiBasicAuthPassword,
    autoStopMinutes: data.autoStopMinutes
  };

  const settings = await prisma.setting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      ...editableData
    },
    update: editableData
  });

  return NextResponse.json(toAppSettings(settings));
}
