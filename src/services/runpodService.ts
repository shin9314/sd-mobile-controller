export async function startPodMock() {
  return {
    ok: true,
    message: "起動ボタンが押されました"
  };
}

export async function stopPodMock() {
  return {
    ok: true,
    message: "停止ボタンが押されました"
  };
}

export async function reconnectPodMock() {
  return {
    ok: true,
    message: "再接続ボタンが押されました"
  };
}
