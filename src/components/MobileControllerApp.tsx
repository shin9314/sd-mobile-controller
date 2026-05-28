"use client";

import {
  Bolt,
  BookMarked,
  Camera,
  ChevronDown,
  Database,
  ImageIcon,
  LockKeyhole,
  Loader2,
  LogOut,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Settings,
  Shuffle,
  Trash2,
  Upload,
  Wand2
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import {
  controlNetTypes,
  createDefaultLora,
  defaultAppSettings,
  defaultGenerationSettings,
  loraOptions,
  modelOptions,
  samplerOptions,
  sizeOptions,
  vaeOptions
} from "@/lib/defaults";
import type {
  ApiStatus,
  AppSettings,
  GenerationRecord,
  GenerationSettings,
  LoraItem,
  PodStatus,
  PresetRecord,
  Screen,
  SdApiCheckResult
} from "@/lib/types";
import { reconnectPodMock, startPodMock, stopPodMock } from "@/services/runpodService";

type LogItem = {
  id: string;
  message: string;
  time: string;
};

type AuthState = "checking" | "authenticated" | "unauthenticated";

const screenLabels: Record<Screen, string> = {
  generate: "生成",
  gallery: "画像",
  presets: "プリセット",
  settings: "設定"
};

const screenIcons = {
  generate: Wand2,
  gallery: ImageIcon,
  presets: BookMarked,
  settings: Settings
};

function nowLabel() {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function promptLead(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "プロンプト未入力";
  }
  return trimmed.length > 38 ? `${trimmed.slice(0, 38)}...` : trimmed;
}

function createPresetName() {
  return `Preset ${new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date())}`;
}

function statusTone(status: PodStatus) {
  if (status === "生成中") {
    return "border-cyanfire-500/30 bg-cyanfire-500/10 text-cyanfire-400";
  }
  if (status === "起動中") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

function apiStatusTone(status: ApiStatus) {
  if (status === "接続OK") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (status === "接続失敗") {
    return "border-red-400/30 bg-red-500/10 text-red-200";
  }

  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

function optionsWithCurrent(options: readonly string[], current: string) {
  if (!current || options.includes(current)) {
    return options;
  }

  return [current, ...options];
}

function cloneGenerationSettings(source: GenerationSettings): GenerationSettings {
  return {
    ...source,
    loras: source.loras.map((lora) => ({ ...lora })),
    controlNet: { ...source.controlNet }
  };
}

export function MobileControllerApp() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [screen, setScreen] = useState<Screen>("generate");
  const [podStatus, setPodStatus] = useState<PodStatus>("停止中");
  const [apiStatus, setApiStatus] = useState<ApiStatus>("未接続");
  const [form, setForm] = useState<GenerationSettings>(defaultGenerationSettings);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [generations, setGenerations] = useState<GenerationRecord[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<GenerationRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isCheckingSdApi, setIsCheckingSdApi] = useState(false);
  const [sdApiCheckResult, setSdApiCheckResult] = useState<SdApiCheckResult | null>(null);
  const [sdModelOptions, setSdModelOptions] = useState<readonly string[]>(modelOptions);
  const [sdSamplerOptions, setSdSamplerOptions] = useState<readonly string[]>(samplerOptions);
  const [sdVaeOptions, setSdVaeOptions] = useState<readonly string[]>(vaeOptions);
  const didRunClientInitRef = useRef(false);

  const recentGeneration = generations[0] ?? null;

  const addLog = useCallback((message: string) => {
    setLogs((current) => [
      { id: crypto.randomUUID(), message, time: nowLabel() },
      ...current
    ].slice(0, 10));
  }, []);

  const updateForm = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const replaceForm = (settings: GenerationSettings) => {
    setForm(cloneGenerationSettings(settings));
    setScreen("generate");
    addLog("設定を生成画面へ読み込みました");
  };

  const refreshData = useCallback(async () => {
    const [settings, presetRows, generationRows] = await Promise.all([
      apiClient.getSettings(),
      apiClient.getPresets(),
      apiClient.getGenerations()
    ]);
    setAppSettings(settings);
    if (settings.sdApiLastOk === true) {
      setApiStatus("接続OK");
    } else if (settings.sdApiLastOk === false) {
      setApiStatus("接続失敗");
    }
    setPresets(presetRows);
    setGenerations(generationRows);
  }, []);

  useEffect(() => {
    if (didRunClientInitRef.current) {
      return;
    }

    didRunClientInitRef.current = true;
    const initialize = async () => {
      try {
        const session = await apiClient.getSession();
        if (!session.authenticated) {
          setAuthState("unauthenticated");
          return;
        }

        setAuthState("authenticated");
        addLog("アプリを起動しました");
        await refreshData();
      } catch {
        setAuthState("unauthenticated");
      }
    };

    initialize().catch(() => setAuthState("unauthenticated"));
  }, [addLog, refreshData]);

  const handleLogin = async (user: string, password: string) => {
    try {
      setIsLoggingIn(true);
      setLoginError("");
      await apiClient.login(user, password);
      setAuthState("authenticated");
      addLog("ログインしました");
      try {
        await refreshData();
      } catch {
        addLog("保存データの読み込みに失敗しました");
      }
    } catch {
      setLoginError("IDまたはパスワードが違います。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } finally {
      setAuthState("unauthenticated");
      setScreen("generate");
      setApiStatus("未接続");
      setLogs([]);
      setSdApiCheckResult(null);
    }
  };

  const handleStart = async () => {
    const result = await startPodMock();
    setPodStatus("起動中");
    addLog(result.message);
  };

  const handleStop = async () => {
    const result = await stopPodMock();
    setPodStatus("停止中");
    setApiStatus("未接続");
    addLog(result.message);
  };

  const handleReconnect = async () => {
    const result = await reconnectPodMock();
    setApiStatus("接続OK");
    addLog(result.message);
  };

  const handleSavePreset = async () => {
    try {
      const created = await apiClient.createPreset(createPresetName(), form);
      setPresets((current) => [created, ...current]);
      addLog("プリセットを保存しました");
    } catch {
      addLog("プリセット保存に失敗しました");
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);
    setPodStatus("生成中");
    addLog("txt2img生成リクエストを送信しました");

    try {
      const created = await apiClient.createGeneration(form);
      setGenerations((current) => [created, ...current]);
      setSelectedGeneration(created);
      addLog("実画像を生成しました");
    } catch (error) {
      addLog(error instanceof Error ? error.message : "txt2img生成に失敗しました");
    } finally {
      setPodStatus("起動中");
      setIsGenerating(false);
    }
  };

  const handleDeleteGeneration = async (id: string) => {
    try {
      await apiClient.deleteGeneration(id);
      setGenerations((current) => current.filter((item) => item.id !== id));
      setSelectedGeneration((current) => (current?.id === id ? null : current));
      addLog("画像履歴を削除しました");
    } catch {
      addLog("画像履歴の削除に失敗しました");
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await apiClient.deletePreset(id);
      setPresets((current) => current.filter((item) => item.id !== id));
      addLog("プリセットを削除しました");
    } catch {
      addLog("プリセット削除に失敗しました");
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      const saved = await apiClient.saveSettings(appSettings);
      setAppSettings(saved);
      addLog("設定を保存しました");
    } catch {
      addLog("設定保存に失敗しました");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCheckSdApi = async () => {
    try {
      setIsCheckingSdApi(true);
      const result = await apiClient.checkSdApi(appSettings);
      setSdApiCheckResult(result);
      setApiStatus(result.ok ? "接続OK" : "接続失敗");
      setAppSettings((current) => ({
        ...current,
        sdApiLastCheckedAt: new Date().toISOString(),
        sdApiLastOk: result.ok,
        sdApiLastError: result.ok ? null : result.errorMessage,
        sdApiCurrentModel: result.ok ? result.currentModel : null,
        sdApiModelCount: result.ok ? result.modelCount : null,
        sdApiSamplerCount: result.ok ? result.samplerCount : null
      }));

      if (result.ok) {
        if (result.models.length > 0) {
          setSdModelOptions(result.models);
        }
        if (result.samplers.length > 0) {
          setSdSamplerOptions(result.samplers);
        }
        if (result.vaes.length > 0) {
          setSdVaeOptions(result.vaes);
        }
        setForm((current) => ({
          ...current,
          model: result.currentModel !== "不明" ? result.currentModel : result.models[0] ?? current.model,
          sampler: result.samplers.includes(current.sampler) ? current.sampler : result.samplers[0] ?? current.sampler,
          vae: result.vaes.includes(current.vae) ? current.vae : result.vaes[0] ?? current.vae
        }));
        addLog("SD API接続確認に成功しました");
      } else {
        addLog("SD API接続確認に失敗しました");
      }
    } catch {
      const result: SdApiCheckResult = {
        ok: false,
        baseUrl: appSettings.sdApiUrl,
        latencyMs: 0,
        errorMessage: "接続確認APIの呼び出しに失敗しました。Next.js dev serverの状態を確認してください。",
        endpointResults: []
      };
      setSdApiCheckResult(result);
      setApiStatus("接続失敗");
      addLog("SD API接続確認に失敗しました");
    } finally {
      setIsCheckingSdApi(false);
    }
  };

  const content = useMemo(() => {
    if (screen === "gallery") {
      return (
        <GalleryScreen
          generations={generations}
          selectedGeneration={selectedGeneration}
          onSelect={setSelectedGeneration}
          onDelete={handleDeleteGeneration}
          onLoad={replaceForm}
        />
      );
    }

    if (screen === "presets") {
      return (
        <PresetsScreen
          presets={presets}
          onLoad={replaceForm}
          onDelete={handleDeletePreset}
        />
      );
    }

    if (screen === "settings") {
      return (
        <SettingsScreen
          settings={appSettings}
          isSaving={isSavingSettings}
          isCheckingSdApi={isCheckingSdApi}
          sdApiCheckResult={sdApiCheckResult}
          onChange={setAppSettings}
          onCheckSdApi={handleCheckSdApi}
          onLogout={handleLogout}
          onSave={handleSaveSettings}
        />
      );
    }

    return (
      <GenerateScreen
        apiStatus={apiStatus}
        form={form}
        generationModeLabel={apiStatus === "接続OK" ? "実生成モード" : "API未接続"}
        isGenerating={isGenerating}
        logs={logs}
        modelChoices={sdModelOptions}
        podStatus={podStatus}
        recentGeneration={recentGeneration}
        samplerChoices={sdSamplerOptions}
        vaeChoices={sdVaeOptions}
        onGenerate={handleGenerate}
        onReconnect={handleReconnect}
        onSavePreset={handleSavePreset}
        onStart={handleStart}
        onStop={handleStop}
        onOpenGallery={() => setScreen("gallery")}
        onOpenPresets={() => setScreen("presets")}
        onOpenSettings={() => setScreen("settings")}
        onUpdate={updateForm}
      />
    );
  }, [
    apiStatus,
    appSettings,
    form,
    generations,
    isGenerating,
    isCheckingSdApi,
    isSavingSettings,
    logs,
    podStatus,
    presets,
    recentGeneration,
    sdApiCheckResult,
    sdModelOptions,
    sdSamplerOptions,
    sdVaeOptions,
    screen,
    selectedGeneration
  ]);

  if (authState === "checking") {
    return (
      <PhoneFrame>
        <AuthLoadingScreen />
      </PhoneFrame>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <PhoneFrame>
        <LoginScreen error={loginError} isLoggingIn={isLoggingIn} onLogin={handleLogin} />
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame footer={<BottomNav screen={screen} onNavigate={setScreen} />}>
      {content}
    </PhoneFrame>
  );
}

function PhoneFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen justify-center px-2 py-0 text-slate-100 sm:px-4 sm:py-5">
      <div className="relative min-h-screen w-full max-w-[430px] overflow-hidden bg-graphite-950 shadow-phone sm:min-h-[calc(100vh-40px)] sm:rounded-[28px] sm:border sm:border-white/10">
        <div className="h-full min-h-screen overflow-y-auto px-4 pb-28 pt-4 sm:min-h-[calc(100vh-40px)]">
          {children}
        </div>
        {footer}
      </div>
    </main>
  );
}

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="mobile-panel flex w-full items-center gap-3 p-4 text-[13px] text-slate-300">
        <Loader2 className="animate-spin text-cyanfire-400" size={18} />
        セッションを確認しています
      </div>
    </div>
  );
}

function LoginScreen({
  error,
  isLoggingIn,
  onLogin
}: {
  error: string;
  isLoggingIn: boolean;
  onLogin: (user: string, password: string) => void;
}) {
  const [user, setUser] = useState("user");
  const [password, setPassword] = useState("password");

  return (
    <div className="flex min-h-[78vh] items-center">
      <section className="mobile-panel w-full space-y-4 p-5">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[8px] bg-cyanfire-500/10 text-cyanfire-400 ring-1 ring-cyanfire-500/25">
            <LockKeyhole size={22} />
          </div>
          <h1 className="text-[22px] font-black leading-tight text-white">SD Mobile Controller</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            RunPod公開URLからアクセスするため、先にログインしてください。
          </p>
        </div>
        <InputField
          label="Login ID"
          placeholder="user"
          value={user}
          onChange={setUser}
        />
        <InputField
          label="Password"
          type="password"
          placeholder="password"
          value={password}
          onChange={setPassword}
        />
        {error ? (
          <p className="rounded-[8px] bg-red-500/10 p-3 text-[13px] leading-relaxed text-red-100">
            {error}
          </p>
        ) : null}
        <button
          className="touch-button min-h-[52px] w-full bg-cyanfire-500 text-slate-950"
          disabled={isLoggingIn}
          onClick={() => onLogin(user, password)}
        >
          {isLoggingIn ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />}
          ログイン
        </button>
      </section>
    </div>
  );
}

function GenerateScreen({
  apiStatus,
  form,
  generationModeLabel,
  isGenerating,
  logs,
  modelChoices,
  podStatus,
  recentGeneration,
  samplerChoices,
  vaeChoices,
  onGenerate,
  onReconnect,
  onSavePreset,
  onStart,
  onStop,
  onOpenGallery,
  onOpenPresets,
  onOpenSettings,
  onUpdate
}: {
  apiStatus: ApiStatus;
  form: GenerationSettings;
  generationModeLabel: string;
  isGenerating: boolean;
  logs: LogItem[];
  modelChoices: readonly string[];
  podStatus: PodStatus;
  recentGeneration: GenerationRecord | null;
  samplerChoices: readonly string[];
  vaeChoices: readonly string[];
  onGenerate: () => void;
  onReconnect: () => void;
  onSavePreset: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenGallery: () => void;
  onOpenPresets: () => void;
  onOpenSettings: () => void;
  onUpdate: <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => void;
}) {
  const setLoras = (loras: LoraItem[]) => onUpdate("loras", loras);

  return (
    <div className="space-y-4">
      <section className="mobile-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[21px] font-black leading-tight text-white">SD Mobile Controller</h1>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-400">RunPod / Forge / A1111 controller</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge label={`Pod: ${podStatus}`} className={statusTone(podStatus)} />
            <StatusBadge
              label={`API: ${apiStatus}`}
              className={apiStatusTone(apiStatus)}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button className="touch-button bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/25" onClick={onStart}>
            <Power size={16} />
            起動
          </button>
          <button className="touch-button bg-slate-500/10 text-slate-200 ring-1 ring-white/10" onClick={onStop}>
            <Bolt size={16} />
            停止
          </button>
          <button className="touch-button bg-cyanfire-500/10 text-cyanfire-400 ring-1 ring-cyanfire-500/25" onClick={onReconnect}>
            <RefreshCw size={16} />
            再接続
          </button>
        </div>
      </section>

      <section className="mobile-panel space-y-3 p-4">
        <TextAreaField
          label="プロンプト"
          placeholder="生成したい内容を入力"
          rows={5}
          value={form.prompt}
          onChange={(value) => onUpdate("prompt", value)}
        />
        <TextAreaField
          label="ネガティブプロンプト"
          placeholder="除外したい内容を入力"
          rows={4}
          value={form.negativePrompt}
          onChange={(value) => onUpdate("negativePrompt", value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" onClick={onSavePreset}>
            <Save size={16} />
            プリセット保存
          </button>
          <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" onClick={onOpenPresets}>
            <Database size={16} />
            保存済みを読込
          </button>
        </div>
      </section>

      <section className="mobile-panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">生成設定</h2>
          <span className="text-[11px] font-semibold text-slate-500">{generationModeLabel}</span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <SelectField label="モデル" value={form.model} options={optionsWithCurrent(modelChoices, form.model)} onChange={(value) => onUpdate("model", value)} />
          <SelectField label="VAE" value={form.vae} options={optionsWithCurrent(vaeChoices, form.vae)} onChange={(value) => onUpdate("vae", value)} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="枚数" value={String(form.count)} options={["1", "2", "3", "4"]} onChange={(value) => onUpdate("count", Number(value))} />
            <SelectField label="サイズ" value={form.size} options={sizeOptions} onChange={(value) => onUpdate("size", value)} />
          </div>
          <SelectField label="サンプラー" value={form.sampler} options={optionsWithCurrent(samplerChoices, form.sampler)} onChange={(value) => onUpdate("sampler", value)} />
          <RangeField label="STEP" min={1} max={80} step={1} value={form.steps} onChange={(value) => onUpdate("steps", value)} />
          <RangeField label="CFG" min={1} max={20} step={0.5} value={form.cfg} onChange={(value) => onUpdate("cfg", value)} />
          <SeedField form={form} onUpdate={onUpdate} />
        </div>
      </section>

      <LoraPanel loras={form.loras} onChange={setLoras} />
      <ControlNetPanel form={form} onUpdate={onUpdate} />

      <button
        className="touch-button min-h-[58px] w-full bg-cyanfire-500 text-[16px] text-slate-950 shadow-glow"
        disabled={isGenerating}
        onClick={onGenerate}
      >
        {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
        生成する
      </button>

      <section className="mobile-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">ログ</h2>
          <span className="text-[11px] text-slate-500">直近 {logs.length} 件</span>
        </div>
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2 rounded-[8px] bg-black/20 px-3 py-2 text-[12px] leading-relaxed text-slate-300">
              <span className="shrink-0 font-semibold text-cyanfire-400">{log.time}</span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mobile-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">直近生成画像</h2>
          <button className="text-[12px] font-bold text-cyanfire-400" onClick={onOpenGallery}>画像一覧へ</button>
        </div>
        {recentGeneration ? (
          <ImageCard generation={recentGeneration} compact />
        ) : (
          <div className="rounded-[8px] border border-dashed border-white/10 bg-black/20 p-5 text-center text-[13px] text-slate-500">
            まだ生成履歴はありません
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" onClick={onOpenGallery}>
            <ImageIcon size={16} />
            画像一覧へ
          </button>
          <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" onClick={onOpenSettings}>
            <Settings size={16} />
            設定へ
          </button>
        </div>
      </section>
    </div>
  );
}

function GalleryScreen({
  generations,
  selectedGeneration,
  onSelect,
  onDelete,
  onLoad
}: {
  generations: GenerationRecord[];
  selectedGeneration: GenerationRecord | null;
  onSelect: (generation: GenerationRecord | null) => void;
  onDelete: (id: string) => void;
  onLoad: (settings: GenerationSettings) => void;
}) {
  return (
    <div className="space-y-4">
      <ScreenHeader title="画像一覧" caption="生成履歴" />

      {selectedGeneration ? (
        <GenerationDetail generation={selectedGeneration} onClose={() => onSelect(null)} onLoad={onLoad} />
      ) : null}

      <div className="space-y-3">
        {generations.length === 0 ? (
          <EmptyState title="画像履歴はまだありません" body="生成画面から画像生成すると、ここに履歴が追加されます。" />
        ) : (
          generations.map((generation) => (
            <article key={generation.id} className="mobile-panel overflow-hidden">
              <ImageCard generation={generation} />
              <div className="grid grid-cols-3 gap-2 border-t border-white/10 p-3">
                <button className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10" onClick={() => onSelect(generation)}>
                  詳細
                </button>
                <button className="touch-button bg-cyanfire-500/10 text-cyanfire-400 ring-1 ring-cyanfire-500/25" onClick={() => onLoad(generation)}>
                  再生成
                </button>
                <button className="touch-button bg-red-500/10 text-red-200 ring-1 ring-red-500/25" onClick={() => onDelete(generation.id)}>
                  <Trash2 size={15} />
                  削除
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function PresetsScreen({
  presets,
  onLoad,
  onDelete
}: {
  presets: PresetRecord[];
  onLoad: (settings: GenerationSettings) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <ScreenHeader title="プリセット" caption="保存済み設定の読込" />
      {presets.length === 0 ? (
        <EmptyState title="プリセットはまだありません" body="生成画面の「プリセット保存」から現在の設定を保存できます。" />
      ) : (
        <div className="space-y-3">
          {presets.map((preset) => (
            <article key={preset.id} className="mobile-panel space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-white">{preset.name}</h2>
                  <p className="mt-1 text-[12px] text-slate-500">{dateTimeLabel(preset.updatedAt)} 更新</p>
                </div>
                <StatusBadge label={preset.model} className="border-cyanfire-500/25 bg-cyanfire-500/10 text-cyanfire-400" />
              </div>
              <p className="rounded-[8px] bg-black/20 p-3 text-[13px] leading-relaxed text-slate-300">{promptLead(preset.prompt)}</p>
              <div className="grid grid-cols-3 gap-2 text-[12px] text-slate-400">
                <SpecPill label={preset.size} />
                <SpecPill label={`${preset.steps} step`} />
                <SpecPill label={`CFG ${preset.cfg}`} />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button className="touch-button bg-cyanfire-500 text-slate-950" onClick={() => onLoad(preset)}>
                  読み込む
                </button>
                <button className="touch-button w-12 bg-red-500/10 text-red-200 ring-1 ring-red-500/25" aria-label="プリセット削除" onClick={() => onDelete(preset.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsScreen({
  settings,
  isSaving,
  isCheckingSdApi,
  sdApiCheckResult,
  onChange,
  onCheckSdApi,
  onLogout,
  onSave
}: {
  settings: AppSettings;
  isSaving: boolean;
  isCheckingSdApi: boolean;
  sdApiCheckResult: SdApiCheckResult | null;
  onChange: (settings: AppSettings) => void;
  onCheckSdApi: () => void;
  onLogout: () => void;
  onSave: () => void;
}) {
  const patch = (value: Partial<AppSettings>) => onChange({ ...settings, ...value });

  return (
    <div className="space-y-4">
      <ScreenHeader title="設定" caption="Step 2 接続確認" />
      <section className="mobile-panel space-y-4 p-4">
        <InputField
          label="RunPod API Key"
          type="password"
          placeholder="伏せ字で保存"
          value={settings.runpodApiKey}
          onChange={(value) => patch({ runpodApiKey: value })}
        />
        <InputField
          label="Pod ID"
          placeholder="例: xxxxxxxx"
          value={settings.podId}
          onChange={(value) => patch({ podId: value })}
        />
        <InputField
          label="Stable Diffusion API URL"
          placeholder="例: https://example.runpod.net"
          value={settings.sdApiUrl}
          onChange={(value) => patch({ sdApiUrl: value })}
        />
        <div className="grid grid-cols-1 gap-3">
          <InputField
            label="SD API Basic Auth User"
            placeholder="user"
            value={settings.sdApiBasicAuthUser}
            onChange={(value) => patch({ sdApiBasicAuthUser: value })}
          />
          <InputField
            label="SD API Basic Auth Password"
            type="password"
            placeholder="password"
            value={settings.sdApiBasicAuthPassword}
            onChange={(value) => patch({ sdApiBasicAuthPassword: value })}
          />
        </div>
        <button className="touch-button min-h-[52px] w-full bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/25" disabled={isCheckingSdApi} onClick={onCheckSdApi}>
          {isCheckingSdApi ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
          SD API接続確認
        </button>
        <SelectField
          label="自動停止時間"
          value={settings.autoStopMinutes === null ? "none" : String(settings.autoStopMinutes)}
          options={["15", "30", "60", "none"]}
          optionLabels={{ "15": "15分", "30": "30分", "60": "60分", none: "なし" }}
          onChange={(value) => patch({ autoStopMinutes: value === "none" ? null : Number(value) })}
        />
        <button className="touch-button min-h-[52px] w-full bg-cyanfire-500 text-slate-950" disabled={isSaving} onClick={onSave}>
          {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          設定を保存
        </button>
        <button className="touch-button min-h-[48px] w-full bg-slate-500/10 text-slate-200 ring-1 ring-white/10" onClick={onLogout}>
          <LogOut size={18} />
          ログアウト
        </button>
      </section>
      <SdApiCheckPanel result={sdApiCheckResult} settings={settings} />
      <section className="mobile-panel p-4 text-[13px] leading-relaxed text-slate-400">
        Step 2 では Next.js API route 経由で Stable Diffusion / Forge / A1111 API の疎通確認だけを行います。txt2img生成は次のStepで実装します。
      </section>
    </div>
  );
}

function SdApiCheckPanel({ result, settings }: { result: SdApiCheckResult | null; settings: AppSettings }) {
  const lastCheckedAt = settings.sdApiLastCheckedAt ? dateTimeLabel(settings.sdApiLastCheckedAt) : null;

  if (!result && settings.sdApiLastOk === null) {
    return (
      <section className="mobile-panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">SD API接続状態</h2>
          <StatusBadge label="未確認" className={apiStatusTone("未接続")} />
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="mobile-panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">SD API接続状態</h2>
          <StatusBadge label={settings.sdApiLastOk ? "接続OK" : "接続失敗"} className={apiStatusTone(settings.sdApiLastOk ? "接続OK" : "接続失敗")} />
        </div>
        {lastCheckedAt ? <p className="text-[12px] text-slate-500">前回確認: {lastCheckedAt}</p> : null}
        {settings.sdApiLastOk ? (
          <div className="grid grid-cols-2 gap-2">
            <DetailPill label="現在のモデル" value={settings.sdApiCurrentModel ?? "不明"} />
            <DetailPill label="モデル数" value={String(settings.sdApiModelCount ?? 0)} />
            <DetailPill label="サンプラー数" value={String(settings.sdApiSamplerCount ?? 0)} />
          </div>
        ) : (
          <p className="rounded-[8px] bg-red-500/10 p-3 text-[13px] leading-relaxed text-red-100">
            {settings.sdApiLastError ?? "前回の接続確認に失敗しました。"}
          </p>
        )}
      </section>
    );
  }

  if (!result.ok) {
    return (
      <section className="mobile-panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">SD API接続状態</h2>
          <StatusBadge label="接続失敗" className={apiStatusTone("接続失敗")} />
        </div>
        <DetailPill label="レイテンシ" value={`${result.latencyMs} ms`} />
        <p className="rounded-[8px] bg-red-500/10 p-3 text-[13px] leading-relaxed text-red-100">
          {result.errorMessage}
        </p>
        <p className="text-[12px] leading-relaxed text-slate-400">
          入力URL、Stable Diffusion WebUIの --api 起動、RunPod Proxy、Basic認証情報を確認してください。
        </p>
        <ControlNetStatus result={result.controlNet} />
        <EndpointDebugList endpoints={result.endpointResults} />
      </section>
    );
  }

  return (
    <section className="mobile-panel space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">SD API接続状態</h2>
        <StatusBadge label="接続OK" className={apiStatusTone("接続OK")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailPill label="現在のモデル" value={result.currentModel} />
        <DetailPill label="モデル数" value={String(result.modelCount)} />
        <DetailPill label="VAE数" value={String(result.vaeCount)} />
        <DetailPill label="LoRA数" value={String(result.loraCount)} />
        <DetailPill label="サンプラー数" value={String(result.samplerCount)} />
        <DetailPill label="レイテンシ" value={`${result.latencyMs} ms`} />
      </div>
      <ControlNetStatus result={result.controlNet} />
      {result.warnings?.length ? (
        <div className="space-y-1 rounded-[8px] bg-amber-400/10 p-3 text-[12px] leading-relaxed text-amber-100">
          {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
      <EndpointDebugList endpoints={result.endpointResults} />
    </section>
  );
}

function ControlNetStatus({ result }: { result?: SdApiCheckResult["controlNet"] }) {
  if (!result) {
    return <DetailPill label="ControlNet API" value="未確認" />;
  }

  if (!result.ok) {
    return (
      <div className="space-y-2 rounded-[8px] bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-slate-500">ControlNet API</p>
          <StatusBadge label="接続失敗" className="border-amber-400/30 bg-amber-400/10 text-amber-200" />
        </div>
        <p className="text-[12px] leading-relaxed text-slate-300">{result.errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <DetailPill label="ControlNet API" value="接続OK" />
      <DetailPill label="ControlNet版" value={result.version} />
      <DetailPill label="CNモデル数" value={String(result.modelCount)} />
      <DetailPill label="CNモジュール数" value={String(result.moduleCount)} />
    </div>
  );
}

function EndpointDebugList({ endpoints }: { endpoints: SdApiCheckResult["endpointResults"] }) {
  if (endpoints.length === 0) {
    return null;
  }

  return (
    <details className="rounded-[8px] border border-white/10 bg-black/20 p-3">
      <summary className="cursor-pointer list-none text-[13px] font-bold text-slate-100">
        詳細デバッグ
      </summary>
      <div className="mt-3 space-y-2">
        {endpoints.map((endpoint) => (
          <div key={`${endpoint.endpoint}-${endpoint.status}-${endpoint.url}`} className="rounded-[8px] bg-graphite-900/70 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-all text-[12px] font-bold text-slate-100">{endpoint.endpoint}</p>
                <p className="mt-1 break-all text-[10px] text-slate-500">{endpoint.url}</p>
              </div>
              <StatusBadge
                label={endpoint.ok ? "成功" : "失敗"}
                className={endpoint.ok ? apiStatusTone("接続OK") : apiStatusTone("接続失敗")}
              />
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-[11px] text-slate-400">
              <DebugLine label="status" value={endpoint.status === null ? "-" : `${endpoint.status} ${endpoint.statusText}`} />
              <DebugLine label="content-type" value={endpoint.contentType ?? "-"} />
              {endpoint.parseError ? <DebugLine label="parseError" value={endpoint.parseError} tone="error" /> : null}
              {endpoint.errorMessage ? <DebugLine label="error" value={endpoint.errorMessage} tone="error" /> : null}
            </div>
            <details className="mt-2 rounded-[8px] bg-black/25 p-2">
              <summary className="cursor-pointer list-none text-[11px] font-bold text-cyanfire-400">bodyPreview</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-slate-300">
                {endpoint.bodyPreview || "(empty)"}
              </pre>
            </details>
          </div>
        ))}
      </div>
    </details>
  );
}

function DebugLine({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "error" }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2">
      <span className="font-bold text-slate-500">{label}</span>
      <span className={`min-w-0 break-all ${tone === "error" ? "text-red-200" : "text-slate-300"}`}>{value}</span>
    </div>
  );
}

function LoraPanel({ loras, onChange }: { loras: LoraItem[]; onChange: (loras: LoraItem[]) => void }) {
  const update = (id: string, patch: Partial<LoraItem>) => {
    onChange(loras.map((lora) => (lora.id === id ? { ...lora, ...patch } : lora)));
  };

  return (
    <details className="mobile-panel group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <span className="section-title">LoRA</span>
        <ChevronDown className="transition group-open:rotate-180" size={18} />
      </summary>
      <div className="mt-4 space-y-3">
        {loras.length === 0 ? (
          <p className="rounded-[8px] bg-black/20 p-3 text-[13px] text-slate-500">LoRA は未追加です</p>
        ) : (
          loras.map((lora) => (
            <div key={lora.id} className="rounded-[8px] border border-white/10 bg-black/20 p-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <SelectField
                  label="LoRA"
                  value={lora.name}
                  options={loraOptions}
                  onChange={(value) => update(lora.id, { name: value })}
                />
                <button className="touch-button mt-[18px] w-11 bg-red-500/10 text-red-200 ring-1 ring-red-500/25" aria-label="LoRA削除" onClick={() => onChange(loras.filter((item) => item.id !== lora.id))}>
                  <Trash2 size={15} />
                </button>
              </div>
              <RangeField label="重み" min={-2} max={2} step={0.1} value={lora.weight} onChange={(value) => update(lora.id, { weight: value })} />
            </div>
          ))
        )}
        <button className="touch-button w-full bg-graphite-700 text-slate-100 ring-1 ring-white/10" onClick={() => onChange([...loras, createDefaultLora()])}>
          <Plus size={16} />
          LoRA追加
        </button>
      </div>
    </details>
  );
}

function ControlNetPanel({
  form,
  onUpdate
}: {
  form: GenerationSettings;
  onUpdate: <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => void;
}) {
  const controlNet = form.controlNet;
  const patch = (value: Partial<typeof controlNet>) => onUpdate("controlNet", { ...controlNet, ...value });

  return (
    <details className="mobile-panel group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <span className="section-title">ControlNet</span>
        <ChevronDown className="transition group-open:rotate-180" size={18} />
      </summary>
      <div className="mt-4 space-y-3">
        <label className="flex min-h-11 items-center justify-between rounded-[8px] bg-black/20 px-3">
          <span className="text-[13px] font-bold text-slate-200">ON/OFF</span>
          <input
            type="checkbox"
            checked={controlNet.enabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
            className="h-5 w-5 accent-cyanfire-500"
          />
        </label>
        <label className="flex min-h-[70px] cursor-pointer flex-col justify-center rounded-[8px] border border-dashed border-white/15 bg-black/20 px-3 py-3 text-[13px] text-slate-400">
          <span className="mb-1 flex items-center gap-2 font-bold text-slate-200"><Upload size={16} /> 入力画像アップロード</span>
          <span className="truncate">{controlNet.imageName || "未選択"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => patch({ imageName: event.target.files?.[0]?.name ?? "" })}
          />
        </label>
        <SelectField label="種類" value={controlNet.type} options={controlNetTypes} onChange={(value) => patch({ type: value as typeof controlNet.type })} />
        <RangeField label="Weight" min={0} max={2} step={0.1} value={controlNet.weight} onChange={(value) => patch({ weight: value })} />
        <div className="grid grid-cols-2 gap-3">
          <RangeField label="Start" min={0} max={1} step={0.05} value={controlNet.start} onChange={(value) => patch({ start: value })} />
          <RangeField label="End" min={0} max={1} step={0.05} value={controlNet.end} onChange={(value) => patch({ end: value })} />
        </div>
      </div>
    </details>
  );
}

function SeedField({
  form,
  onUpdate
}: {
  form: GenerationSettings;
  onUpdate: <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="field-label" htmlFor="seed-input">Seed</label>
        <label className="flex items-center gap-2 text-[12px] font-bold text-slate-300">
          <input
            type="checkbox"
            checked={form.fixedSeed}
            onChange={(event) => onUpdate("fixedSeed", event.target.checked)}
            className="h-4 w-4 accent-cyanfire-500"
          />
          固定
        </label>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          id="seed-input"
          className="field-control"
          inputMode="numeric"
          type="number"
          value={form.seed}
          onChange={(event) => onUpdate("seed", Number(event.target.value))}
        />
        <button
          className="touch-button bg-graphite-700 text-slate-100 ring-1 ring-white/10"
          onClick={() => onUpdate("seed", Math.floor(Math.random() * 2147483647))}
        >
          <Shuffle size={16} />
          ランダム
        </button>
      </div>
    </div>
  );
}

function GenerationDetail({
  generation,
  onClose,
  onLoad
}: {
  generation: GenerationRecord;
  onClose: () => void;
  onLoad: (settings: GenerationSettings) => void;
}) {
  return (
    <section className="mobile-panel overflow-hidden">
      <img src={generation.imageUrl} alt="生成画像詳細" className="aspect-[4/3] w-full object-cover" />
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-white">画像詳細</h2>
          <button className="text-[12px] font-bold text-slate-400" onClick={onClose}>閉じる</button>
        </div>
        <DetailText label="プロンプト" value={generation.prompt || "未入力"} />
        <DetailText label="ネガティブ" value={generation.negativePrompt || "未入力"} />
        <div className="grid grid-cols-2 gap-2">
          <DetailPill label="モデル" value={generation.model} />
          <DetailPill label="VAE" value={generation.vae} />
          <DetailPill label="サイズ" value={generation.size} />
          <DetailPill label="枚数" value={`${generation.count}`} />
          <DetailPill label="サンプラー" value={generation.sampler} />
          <DetailPill label="STEP" value={`${generation.steps}`} />
          <DetailPill label="CFG" value={`${generation.cfg}`} />
          <DetailPill label="Seed" value={`${generation.seed}`} />
        </div>
        <DetailText
          label="LoRA"
          value={generation.loras.length ? generation.loras.map((lora) => `${lora.name} (${lora.weight})`).join(", ") : "未使用"}
        />
        <DetailText
          label="ControlNet"
          value={generation.controlNet.enabled ? `${generation.controlNet.type} / Weight ${generation.controlNet.weight}` : "OFF"}
        />
        {generation.infoText ? (
          <details className="rounded-[8px] bg-black/20 p-3">
            <summary className="cursor-pointer list-none text-[11px] font-bold text-slate-500">A1111 info</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-slate-300">
              {generation.infoText}
            </pre>
          </details>
        ) : null}
        <button className="touch-button min-h-[52px] w-full bg-cyanfire-500 text-slate-950" onClick={() => onLoad(generation)}>
          この設定を生成画面へ読み込む
        </button>
      </div>
    </section>
  );
}

function ImageCard({ generation, compact = false }: { generation: GenerationRecord; compact?: boolean }) {
  return (
    <div className={compact ? "overflow-hidden rounded-[8px] border border-white/10 bg-black/20" : ""}>
      <div className="grid grid-cols-[104px_1fr] gap-3 p-3">
        <img src={generation.imageUrl} alt="生成画像サムネイル" className="h-[128px] w-[104px] rounded-[8px] object-cover" />
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge label={dateTimeLabel(generation.createdAt)} className="border-white/10 bg-white/5 text-slate-300" />
            <StatusBadge label={generation.model} className="border-cyanfire-500/20 bg-cyanfire-500/10 text-cyanfire-400" />
          </div>
          <p className="text-[13px] font-bold leading-relaxed text-slate-100">{promptLead(generation.prompt)}</p>
          <div className="grid grid-cols-2 gap-1.5 text-[12px] text-slate-400">
            <SpecPill label={generation.size} />
            <SpecPill label={`${generation.steps} step`} />
            <SpecPill label={generation.sampler} />
            <SpecPill label={`Seed ${generation.seed}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <nav className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-graphite-900/95 px-3 pb-3 pt-2 backdrop-blur">
      <div className="grid grid-cols-4 gap-1">
        {(Object.keys(screenLabels) as Screen[]).map((item) => {
          const Icon = screenIcons[item];
          const active = screen === item;
          return (
            <button
              key={item}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[8px] text-[11px] font-bold transition ${
                active ? "bg-cyanfire-500 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
              onClick={() => onNavigate(item)}
            >
              <Icon size={18} />
              {screenLabels[item]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center whitespace-nowrap rounded-full border px-2 text-[11px] font-bold leading-none ${className}`}>
      {label}
    </span>
  );
}

function ScreenHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <header className="mobile-panel p-4">
      <h1 className="text-[22px] font-black text-white">{title}</h1>
      <p className="mt-1 text-[13px] text-slate-400">{caption}</p>
    </header>
  );
}

function TextAreaField({
  label,
  placeholder,
  rows,
  value,
  onChange
}: {
  label: string;
  placeholder: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="field-label">{label}</span>
      <textarea className="field-control" placeholder={placeholder} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function InputField({
  label,
  placeholder,
  type = "text",
  value,
  onChange
}: {
  label: string;
  placeholder: string;
  type?: "text" | "password";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="field-label">{label}</span>
      <input className="field-control" type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  optionLabels,
  onChange
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="field-label">{label}</span>
      <select className="field-control appearance-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between">
        <span className="field-label">{label}</span>
        <span className="text-[12px] font-bold text-cyanfire-400">{value}</span>
      </span>
      <input className="w-full accent-cyanfire-500" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SpecPill({ label }: { label: string }) {
  return <span className="truncate rounded-[8px] bg-white/5 px-2 py-1 text-center">{label}</span>;
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-black/20 p-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[13px] font-bold text-slate-100">{value}</p>
    </div>
  );
}

function DetailText({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-black/20 p-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">{value}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="mobile-panel p-5 text-center">
      <Camera className="mx-auto text-slate-500" size={28} />
      <h2 className="mt-3 text-[15px] font-bold text-slate-100">{title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{body}</p>
    </section>
  );
}
