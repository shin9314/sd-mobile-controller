import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";

export const runtime = "nodejs";

const WEBHOOK_TIMEOUT_MS = 8_000;

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout)
  };
}

export async function POST() {
  const unauthorized = await requireAuthResponse();
  if (unauthorized) {
    return unauthorized;
  }

  const webhookUrl = process.env.START_SUCCESS_WEBHOOK_URL?.trim() ?? "";
  const appUrl = process.env.RUNPOD_APP_URL?.trim() ?? "";
  const text = "RunPod起動完了：SD Mobile Controllerを開けます。";

  if (!webhookUrl) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: "START_SUCCESS_WEBHOOK_URL が未設定のためWebhook通知はスキップしました。"
    });
  }

  const timeout = withTimeout(WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: timeout.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: `${text}\n${appUrl}`,
        text,
        appUrl
      })
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          errorMessage: `Webhook通知に失敗しました。HTTP ${response.status}`
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: response.status,
      message: "Webhook通知を送信しました。"
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        status: 0,
        errorMessage: isAbort ? "Webhook通知がタイムアウトしました。" : "Webhook通知に接続できませんでした。"
      },
      { status: 502 }
    );
  } finally {
    timeout.cleanup();
  }
}
