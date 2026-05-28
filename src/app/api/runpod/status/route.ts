import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { getRunpodStatus } from "@/services/runpodRestService";

export const runtime = "nodejs";

export async function GET() {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const result = await getRunpodStatus();
  return NextResponse.json(result, { status: result.ok ? 200 : result.status || 400 });
}
