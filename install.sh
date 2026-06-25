#!/bin/sh
# install.sh — download the matching firefly binary from the latest GitHub Release,
# verify its SHA256 checksum, make it executable, and tell you where to put it.
# Usage: curl -fsSL https://raw.githubusercontent.com/HugoJF/firefly-cli/main/install.sh | sh
set -eu

REPO="HugoJF/firefly-cli"
BIN="firefly"

err() { printf 'error: %s\n' "$1" >&2; exit 1; }

# --- detect OS/arch -----------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux)  os_name="linux" ;;
  Darwin) os_name="darwin" ;;
  *) err "unsupported OS: $os (Windows users: download firefly-windows-x64.exe from the releases page)" ;;
esac

case "$arch" in
  x86_64|amd64)  arch_name="x64" ;;
  arm64|aarch64) arch_name="arm64" ;;
  *) err "unsupported architecture: $arch" ;;
esac

asset="${BIN}-${os_name}-${arch_name}"

# --- resolve the latest release tag ------------------------------------------
api_url="https://api.github.com/repos/${REPO}/releases/latest"
tag="$(curl -fsSL "$api_url" | grep '"tag_name"' | head -n1 | cut -d'"' -f4)"
[ -n "$tag" ] || err "could not determine the latest release tag from $api_url"

base="https://github.com/${REPO}/releases/download/${tag}"
printf 'Installing %s %s for %s/%s...\n' "$BIN" "$tag" "$os_name" "$arch_name"

# --- download into a temp dir ------------------------------------------------
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fSL -o "$tmp/$asset" "$base/$asset" || err "download failed: $base/$asset"
curl -fSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS" || err "could not download SHA256SUMS"

# --- verify checksum ---------------------------------------------------------
expected="$(grep " ${asset}\$" "$tmp/SHA256SUMS" | awk '{print $1}' | head -n1)"
[ -n "$expected" ] || err "no checksum for $asset in SHA256SUMS"

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
else
  err "need sha256sum or shasum to verify the download"
fi

[ "$actual" = "$expected" ] || err "checksum mismatch (expected $expected, got $actual)"
printf 'Checksum verified.\n'

# --- place the binary --------------------------------------------------------
chmod +x "$tmp/$asset"
out="./$BIN"
mv "$tmp/$asset" "$out"

printf '\n%s is ready at %s\n' "$BIN" "$out"
printf 'Move it onto your PATH, e.g.:\n'
printf '  sudo mv %s /usr/local/bin/%s\n' "$out" "$BIN"
