import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { startRunpodPod } from "@/services/runpodRestService";

export const runtime = "nodejs";

export async function POST() {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const result = await startRunpodPod();
  return NextResponse.json(result, { status: result.ok ? 200 : result.status || 400 });
}
