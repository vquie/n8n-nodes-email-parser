#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CUSTOM_ROOT="${REPO_ROOT}/.testdata/custom"
PACKAGE_DIR="${CUSTOM_ROOT}/n8n-nodes-email-parser"
BUILD_ROOT="${REPO_ROOT}/.testdata/build"
BUILD_SCRIPT="${BUILD_ROOT}/build-package.sh"

rm -rf "${BUILD_ROOT}" "${CUSTOM_ROOT}"
mkdir -p "${BUILD_ROOT}" "${CUSTOM_ROOT}" "${PACKAGE_DIR}"

cat > "${BUILD_SCRIPT}" <<'EOF'
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
EOF

chmod +x "${BUILD_SCRIPT}"

echo "[1/2] Building package in Docker..."
docker run --rm \
  -v "${REPO_ROOT}:/workspace" \
  -v "${BUILD_ROOT}:/out" \
  -w /workspace \
  node:22-slim \
  /out/build-package.sh

echo "[2/2] Starting n8n..."

DOCKER_TTY_FLAGS=()
if [[ -t 0 && -t 1 ]]; then
  DOCKER_TTY_FLAGS=(-it)
fi

docker run --rm "${DOCKER_TTY_FLAGS[@]}" \
  -p 5678:5678 \
  -e N8N_SECURE_COOKIE=false \
  -e N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom \
  -v "${CUSTOM_ROOT}:/home/node/.n8n/custom" \
  n8nio/n8n:latest
