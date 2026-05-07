#!/bin/sh
# install.sh — download and install the latest zview binary from GitHub Releases.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/kyaoi/zview/main/install.sh | sh
#
# Environment variables:
#   INSTALL_DIR  — directory to install the binary into (default: $HOME/.local/bin)
#   VERSION      — install a specific version (e.g., v1.2.3) instead of the latest

set -eu

REPO="kyaoi/zview"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

# --- helpers ----------------------------------------------------------------

info()  { printf '[info]  %s\n' "$*"; }
error() { printf '[error] %s\n' "$*" >&2; exit 1; }

need_cmd() {
  if ! command -v "$1" > /dev/null 2>&1; then
    error "Required command not found: $1"
  fi
}

# --- detect platform --------------------------------------------------------

detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  os="Linux"  ;;
    Darwin) os="Darwin" ;;
    *)      error "Unsupported OS: $os (only Linux and Darwin are supported)" ;;
  esac

  case "$arch" in
    x86_64|amd64)   arch="x86_64" ;;
    arm64|aarch64)   arch="arm64"  ;;
    *)               error "Unsupported architecture: $arch (only x86_64 and arm64 are supported)" ;;
  esac

  printf '%s_%s' "$os" "$arch"
}

# --- main -------------------------------------------------------------------

main() {
  need_cmd curl
  need_cmd tar
  need_cmd uname
  need_cmd mktemp

  info "Detecting platform..."
  platform="$(detect_platform)"
  info "Platform: $platform"

  if [ -n "${VERSION:-}" ]; then
    tag="$VERSION"
    info "Using specified release tag: $tag"
  else
    info "Fetching latest release tag..."
    tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
      | grep '"tag_name"' \
      | head -1 \
      | sed 's/.*"tag_name": *"//;s/".*//')"
  fi

  if [ -z "$tag" ]; then
    error "Failed to determine the latest release tag."
  fi
  info "Latest release: $tag"

  # Strip leading 'v' for the asset filename (GoReleaser uses version without v)
  version="${tag#v}"
  archive="zview_${platform}.tar.gz"
  checksums="checksums.txt"
  base_url="https://github.com/${REPO}/releases/download/${tag}"

  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  info "Downloading ${archive}..."
  curl -fsSL -o "${tmpdir}/${archive}" "${base_url}/${archive}"

  info "Downloading ${checksums}..."
  curl -fsSL -o "${tmpdir}/${checksums}" "${base_url}/${checksums}"

  info "Verifying checksum..."
  expected="$(grep "${archive}" "${tmpdir}/${checksums}" | awk '{print $1}')"
  if [ -z "$expected" ]; then
    error "Checksum for ${archive} not found in ${checksums}."
  fi

  if command -v sha256sum > /dev/null 2>&1; then
    actual="$(sha256sum "${tmpdir}/${archive}" | awk '{print $1}')"
  elif command -v shasum > /dev/null 2>&1; then
    actual="$(shasum -a 256 "${tmpdir}/${archive}" | awk '{print $1}')"
  else
    error "Neither sha256sum nor shasum found. Cannot verify checksum."
  fi

  if [ "$expected" != "$actual" ]; then
    error "Checksum mismatch!\n  expected: ${expected}\n  actual:   ${actual}"
  fi
  info "Checksum OK."

  info "Extracting..."
  tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}"

  info "Installing to ${INSTALL_DIR}/zview..."
  mkdir -p "${INSTALL_DIR}"
  cp "${tmpdir}/zview" "${INSTALL_DIR}/zview"
  chmod +x "${INSTALL_DIR}/zview"

  info "Installed zview ${tag} to ${INSTALL_DIR}/zview"

  # Check if INSTALL_DIR is in PATH
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      printf '\n'
      info "NOTE: ${INSTALL_DIR} is not in your PATH."
      info "Add it by running:"
      info "  export PATH=\"${INSTALL_DIR}:\$PATH\""
      ;;
  esac
}

main
