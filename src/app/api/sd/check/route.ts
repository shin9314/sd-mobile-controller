import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { defaultAppSettings } from "@/lib/defaults";
import { prisma } from "@/lib/prisma";
import { checkSdApiConnection, normalizeSdApiUrl } from "@/services/sdApiService";

export const runtime = "nodejs";

function textFromBody(body: Record<string, unknown>, key: string) {
  return typeof body[key] === "string" ? body[key] as string : undefined;
}

async function readBody(request: Request) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function getSettings() {
  const existing = await prisma.setting.findUnique({
    where: { id: 1 }
  });

  return existing ?? await prisma.setting.create({
    data: {
      id: 1,
      runpodApiKey: defaultAppSettings.runpodApiKey,
      podId: defaultAppSettings.podId,
      sdApiUrl: process.env.SD_API_BASE_URL || defaultAppSettings.sdApiUrl,
      sdApiBasicAuthUser: process.env.SD_API_BASIC_USER || defaultAppSettings.sdApiBasicAuthUser,
      sdApiBasicAuthPassword: process.env.SD_API_BASIC_PASSWORD || defaultAppSettings.sdApiBasicAuthPassword,
      autoStopMinutes: defaultAppSettings.autoStopMinutes
    }
  });
}

async function saveCheckResult(result: Awaited<ReturnType<typeof checkSdApiConnection>>) {
  await prisma.setting.update({
    where: { id: 1 },
    data: {
      sdApiLastCheckedAt: new Date(),
      sdApiLastOk: result.ok,
      sdApiLastError: result.ok ? null : result.errorMessage,
      sdApiCurrentModel: result.ok ? result.currentModel : null,
      sdApiModelCount: result.ok ? result.modelCount : null,
      sdApiSamplerCount: result.ok ? result.samplerCount : null
    }
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readBody(request);
  const settings = await getSettings();
  const apiUrl = Object.prototype.hasOwnProperty.call(body, "apiUrl")
    ? textFromBody(body, "apiUrl") ?? ""
    : settings.sdApiUrl;
  const authUser = Object.prototype.hasOwnProperty.call(body, "sdApiBasicAuthUser")
    ? textFromBody(body, "sdApiBasicAuthUser") ?? ""
    : settings.sdApiBasicAuthUser;
  const authPassword = Object.prototype.hasOwnProperty.call(body, "sdApiBasicAuthPassword")
    ? textFromBody(body, "sdApiBasicAuthPassword") ?? ""
    : settings.sdApiBasicAuthPassword;

  try {
    normalizeSdApiUrl(apiUrl);
  } catch (error) {
    const result = {
      ok: false as const,
      baseUrl: apiUrl.trim(),
      latencyMs: 0,
      errorMessage: error instanceof Error ? error.message : "Stable Diffusion API URLを確認してください。",
      endpointResults: []
    };
    await saveCheckResult(result);

    return NextResponse.json(result, { status: 400 });
  }

  const result = await checkSdApiConnection(apiUrl, {
    user: authUser,
    password: authPassword
  });
  await saveCheckResult(result);

  return NextResponse.json(result);
}
