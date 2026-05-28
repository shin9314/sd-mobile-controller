import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { checkRunpodHealth } from "@/services/runpodRestService";

export const runtime = "nodejs";

export async function GET() {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  return NextResponse.json(await checkRunpodHealth());
}
