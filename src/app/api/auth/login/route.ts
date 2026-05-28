import { NextResponse } from "next/server";
import { setSessionCookie, verifyLogin } from "@/lib/auth";

export const runtime = "nodejs";

async function readBody(request: Request) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const user = typeof body.user === "string" ? body.user : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyLogin(user, password)) {
    return NextResponse.json(
      { ok: false, errorMessage: "IDまたはパスワードが違います。" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookie(response);

  return response;
}
