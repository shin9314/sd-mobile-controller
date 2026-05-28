import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";

export const runtime = "nodejs";

const GENERATED_DIR = path.join(process.cwd(), "storage", "generated");

function isSafeFilename(filename: string) {
  return /^[a-zA-Z0-9_.-]+\.png$/.test(filename) && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const { filename } = await params;
  if (!isSafeFilename(filename)) {
    return NextResponse.json({ errorMessage: "画像ファイル名が不正です。" }, { status: 400 });
  }

  try {
    const file = await readFile(path.join(GENERATED_DIR, filename));

    return new Response(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ errorMessage: "画像ファイルが見つかりません。" }, { status: 404 });
  }
}
