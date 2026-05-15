#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR=/tmp/n8n-nodes-email-parser-src
PACKAGE_DIR=/workspace/.testdata/custom/n8n-nodes-email-parser

rm -rf "${SOURCE_DIR}"
mkdir -p "${SOURCE_DIR}"
cp -R /workspace/. "${SOURCE_DIR}"

cd "${SOURCE_DIR}"
npm install
npm run build

mkdir -p "${PACKAGE_DIR}"
cp package.json index.js "${PACKAGE_DIR}/"
cp -R dist "${PACKAGE_DIR}/dist"
cd "${PACKAGE_DIR}"
npm install --omit=dev
