# SD Mobile Controller

RunPod 上の Stable Diffusion / Forge / A1111 を、外出先のスマホから操作するための個人用 Web アプリです。

Step 1 ではスマホ縦長 UI、Prisma + SQLite 保存、ダミー生成処理までを実装しています。
Step 2 では Stable Diffusion / Forge / A1111 API への接続確認を Next.js API route 経由で実装しています。実画像生成はまだ行いません。

## 技術構成

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- SQLite

## 起動方法

```bash
npm install
npm run prisma:migrate
npm run dev
```

PowerShell の実行ポリシーで `npm` が止まる場合は、Windows では次のように `npm.cmd` を使えます。

```powershell
npm.cmd install
npm.cmd run prisma:migrate
npm.cmd run dev
```

起動後、以下をブラウザで開きます。

```text
http://localhost:3000
```

PC ブラウザでは中央に最大幅 430px のスマホ画面として表示されます。

## npm scripts

- `npm run dev` - 開発サーバー起動
- `npm run build` - Prisma Client 生成後に Next.js をビルド
- `npm run start` - production サーバー起動
- `npm run prisma:migrate` - SQLite の Prisma migration 実行
- `npm run prisma:studio` - Prisma Studio 起動

## 実装済み

- 生成画面
- 画像一覧画面
- 画像詳細表示
- プリセット一覧 / 読込画面
- 設定画面
- 下部固定ナビゲーション
- スマホ縦長 UI と PC 中央スマホ幅表示
- Pod / API 状態バッジ
- 起動 / 停止 / 再接続の mock ログ
- プロンプト / ネガティブプロンプト入力
- モデル、VAE、サイズ、枚数、サンプラー、STEP、CFG、Seed 設定
- LoRA 折りたたみ UI と重み設定
- ControlNet 折りたたみ UI、ON/OFF、画像選択、種類、Weight、Start、End
- 2秒待機のダミー生成
- ダミー画像履歴保存
- プリセット保存 / 読込 / 削除
- 設定保存
- Stable Diffusion API URL の接続確認
- SD API Basic Auth User / Password の保存と接続確認時の Basic 認証
- `/sdapi/v1/options`、`sd-models`、`samplers`、`sd-vae`、`loras` の疎通確認
- ControlNet API の `version`、`model_list`、`module_list` 確認
- 接続確認結果、現在モデル、モデル数、サンプラー数の保存
- Prisma + SQLite による `settings`、`presets`、`generation_history` 相当データの保存

## 未実装

- RunPod API への実接続
- Stable Diffusion / Forge / A1111 API への実画像生成リクエスト
- ControlNet 実処理
- LoRA の実生成パラメータ反映
- 生成画像ファイルの実保存 / ダウンロード
- 認証

## Step 2 接続確認

設定画面で `Stable Diffusion API URL`、`SD API Basic Auth User`、`SD API Basic Auth Password` を保存できます。
Basic認証の初期値は AI-Dock Stable Diffusion WebUI の個人運用前提で `user` / `password` です。

`SD API接続確認` ボタンはブラウザから直接 WebUI API を叩かず、`POST /api/sd/check` を経由します。
この API route がサーバー側から Stable Diffusion API に接続し、CORS を回避しつつ将来の RunPod 連携や認証追加に備えます。

確認対象:

- `GET /sdapi/v1/options`
- `GET /sdapi/v1/sd-models`
- `GET /sdapi/v1/samplers`
- `GET /sdapi/v1/sd-vae`
- `GET /sdapi/v1/loras`
- `GET /controlnet/version`
- `GET /controlnet/model_list`
- `GET /controlnet/module_list`

ControlNet API の失敗は SD API 本体の成功/失敗とは分けて表示します。

## Step 3 の候補

- `src/services/runpodService.ts` を実 API 実装へ差し替え
- `src/services/sdApiService.ts` に A1111 / Forge の txt2img リクエストを実装
- 接続確認済みのモデル / VAE / サンプラー / LoRA 一覧を生成パラメータへ本格反映
- 生成履歴に実画像 URL またはローカル保存パスを保存
- エラー表示、タイムアウト、再試行、Pod 自動停止を追加

## RunPod 公開ポートでの起動手順

Cloudflare Tunnel や ngrok は使わず、RunPod の HTTP 公開ポートだけでスマホからアクセスする想定です。

構成:

```text
スマホ
↓
https://PODID-3000.proxy.runpod.net
↓
SD Mobile Controller / Next.js
↓
http://127.0.0.1:17860
↓
A1111 API
```

RunPod 側の HTTP ports に `3000` を追加してください。A1111 / Forge は Pod 内で `http://0.0.0.0:17860` として起動しておきます。

```bash
cd /workspace
cp .env.example .env
npm install
npm run prisma:migrate
npm run build:runpod
npm run start:runpod
```

セットアップをまとめて実行する場合:

```bash
cd /workspace/sd-mobile-controller
bash scripts/runpod-setup.sh
bash scripts/runpod-start.sh
```

スマホから以下を開きます。

```text
https://PODID-3000.proxy.runpod.net
```

初期ログイン:

```text
ID: user
Password: password
```

ログイン後、設定画面で `Stable Diffusion API URL` が `http://127.0.0.1:17860` になっていることを確認し、`SD API接続確認` を実行してください。

`.env` の主な値:

```env
DATABASE_URL="file:./dev.db"
APP_LOGIN_USER="user"
APP_LOGIN_PASSWORD="password"
SD_API_BASE_URL="http://127.0.0.1:17860"
SD_API_BASIC_USER=""
SD_API_BASIC_PASSWORD=""
APP_HOST="0.0.0.0"
APP_PORT="3000"
```

## Launch Controller

`/launch` は、RunPod Pod が停止していて SD Mobile Controller 本体を開けない時のための軽量な起動入口です。
スマホから Launch Controller を開き、RunPod REST API 経由で Pod の状態確認、起動、停止を行います。

重要: `RUNPOD_API_KEY` は必ずサーバー側の `.env` にだけ保存してください。フロントエンドへ返さず、画面にも表示しません。

追加の `.env`:

```env
RUNPOD_API_KEY=""
RUNPOD_POD_ID=""
RUNPOD_APP_URL="https://PODID-3000.proxy.runpod.net"
RUNPOD_WEBUI_URL="https://PODID-7860.proxy.runpod.net"
APP_LOGIN_USER="user"
APP_LOGIN_PASSWORD="password"
```

RunPod API Key は RunPod のアカウント設定画面で作成し、`RUNPOD_API_KEY` に設定します。
Pod ID は RunPod の Pod 詳細画面、または公開URLの `PODID-3000.proxy.runpod.net` の `PODID` 部分を `RUNPOD_POD_ID` に設定します。

スマホ運用:

1. Launch Controller の公開URLを開く
2. `user` / `password` でログイン
3. `状態更新` で Pod 状態を確認
4. Pod停止中なら `Pod起動`
5. `SD Mobile Controller` の応答が `応答あり` になるまで待つ
6. `開く` で `RUNPOD_APP_URL` を新規タブで開く
7. 作業後は必要に応じて `Pod停止`

Launch Controller が確認するもの:

- Pod状態: RunPod REST API `GET /v1/pods/{podId}`
- Pod起動: RunPod REST API `POST /v1/pods/{podId}/start`
- Pod停止: RunPod REST API `POST /v1/pods/{podId}/stop`
- SD Mobile Controller応答: `RUNPOD_APP_URL`
- A1111 API docs応答: `RUNPOD_WEBUI_URL/docs`
