ALTER TABLE "Setting" ADD COLUMN "sdApiBasicAuthUser" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "Setting" ADD COLUMN "sdApiBasicAuthPassword" TEXT NOT NULL DEFAULT 'password';
ALTER TABLE "Setting" ADD COLUMN "sdApiLastCheckedAt" DATETIME;
ALTER TABLE "Setting" ADD COLUMN "sdApiLastOk" BOOLEAN;
ALTER TABLE "Setting" ADD COLUMN "sdApiLastError" TEXT;
ALTER TABLE "Setting" ADD COLUMN "sdApiCurrentModel" TEXT;
ALTER TABLE "Setting" ADD COLUMN "sdApiModelCount" INTEGER;
ALTER TABLE "Setting" ADD COLUMN "sdApiSamplerCount" INTEGER;
