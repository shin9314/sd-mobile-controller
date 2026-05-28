#!/usr/bin/env bash
set -euo pipefail

npm install
npm run prisma:migrate
npm run build:runpod
