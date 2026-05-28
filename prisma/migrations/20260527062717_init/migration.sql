-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runpodApiKey" TEXT NOT NULL DEFAULT '',
    "podId" TEXT NOT NULL DEFAULT '',
    "sdApiUrl" TEXT NOT NULL DEFAULT '',
    "autoStopMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Preset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "vae" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "sampler" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "cfg" REAL NOT NULL,
    "seed" INTEGER NOT NULL,
    "fixedSeed" BOOLEAN NOT NULL DEFAULT false,
    "lorasJson" TEXT NOT NULL DEFAULT '[]',
    "controlNetJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GenerationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "vae" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "sampler" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "cfg" REAL NOT NULL,
    "seed" INTEGER NOT NULL,
    "fixedSeed" BOOLEAN NOT NULL DEFAULT false,
    "lorasJson" TEXT NOT NULL DEFAULT '[]',
    "controlNetJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
