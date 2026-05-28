PRAGMA foreign_keys=OFF;
PRAGMA defer_foreign_keys=ON;

CREATE TABLE "new_Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runpodApiKey" TEXT NOT NULL DEFAULT '',
    "podId" TEXT NOT NULL DEFAULT '',
    "sdApiUrl" TEXT NOT NULL DEFAULT 'http://127.0.0.1:17860',
    "sdApiBasicAuthUser" TEXT NOT NULL DEFAULT '',
    "sdApiBasicAuthPassword" TEXT NOT NULL DEFAULT '',
    "sdApiLastCheckedAt" DATETIME,
    "sdApiLastOk" BOOLEAN,
    "sdApiLastError" TEXT,
    "sdApiCurrentModel" TEXT,
    "sdApiModelCount" INTEGER,
    "sdApiSamplerCount" INTEGER,
    "autoStopMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Setting" (
    "id",
    "runpodApiKey",
    "podId",
    "sdApiUrl",
    "sdApiBasicAuthUser",
    "sdApiBasicAuthPassword",
    "sdApiLastCheckedAt",
    "sdApiLastOk",
    "sdApiLastError",
    "sdApiCurrentModel",
    "sdApiModelCount",
    "sdApiSamplerCount",
    "autoStopMinutes",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "runpodApiKey",
    "podId",
    "sdApiUrl",
    "sdApiBasicAuthUser",
    "sdApiBasicAuthPassword",
    "sdApiLastCheckedAt",
    "sdApiLastOk",
    "sdApiLastError",
    "sdApiCurrentModel",
    "sdApiModelCount",
    "sdApiSamplerCount",
    "autoStopMinutes",
    "createdAt",
    "updatedAt"
FROM "Setting";

DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";

UPDATE "Setting"
SET "sdApiUrl" = 'http://127.0.0.1:17860'
WHERE "sdApiUrl" = '';

PRAGMA defer_foreign_keys=OFF;
PRAGMA foreign_keys=ON;
