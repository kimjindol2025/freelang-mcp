#!/bin/sh
set -eu

REPOSITORY="${FREELANG_TOOLS_REPOSITORY:-kimjindol2025/freelang-tools}"
REF="${FREELANG_TOOLS_REF:-main}"
INSTALL_ROOT="${FREELANG_TOOLS_HOME:-${HOME:-}/.local/share/freelang-tools}"
BIN_DIR="${FREELANG_TOOLS_BIN:-${HOME:-}/.local/bin}"
ARCHIVE_URL="https://codeload.github.com/${REPOSITORY}/tar.gz/refs/heads/${REF}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"

if [ -z "${HOME:-}" ]; then
  echo "INSTALL=BLOCKED"
  echo "CAUSE=HOME is not set" >&2
  exit 2
fi

for command_name in curl tar mktemp mkdir ln cp rm find; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "INSTALL=BLOCKED"
    echo "CAUSE=required command not found: $command_name" >&2
    exit 2
  fi
done

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/freelang-tools.XXXXXX")"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT INT TERM

echo "SOURCE=https://github.com/$REPOSITORY"
echo "REF=$REF"
echo "INSTALL_ROOT=$INSTALL_ROOT"
echo "BIN_DIR=$BIN_DIR"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

if [ -x "$SCRIPT_DIR/scripts/fl-tools" ] && [ -x "$SCRIPT_DIR/scripts/fl-test" ]; then
  SOURCE_DIR="$SCRIPT_DIR"
  echo "SOURCE_MODE=local-checkout"
else
  echo "SOURCE_MODE=github-archive"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" "$ARCHIVE_URL" -o "$TEMP_DIR/source.tar.gz"
  elif [ -n "${GH_TOKEN:-}" ]; then
    curl -fsSL -H "Authorization: Bearer $GH_TOKEN" "$ARCHIVE_URL" -o "$TEMP_DIR/source.tar.gz"
  else
    curl -fsSL "$ARCHIVE_URL" -o "$TEMP_DIR/source.tar.gz"
  fi

  tar -xzf "$TEMP_DIR/source.tar.gz" -C "$TEMP_DIR"
  SOURCE_DIR="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'freelang-tools-*' -print -quit)"
  if [ -z "$SOURCE_DIR" ]; then
    echo "INSTALL=BLOCKED"
    echo "CAUSE=source archive layout not recognized" >&2
    exit 1
  fi
fi

rm -rf "$INSTALL_ROOT/current"
mkdir -p "$INSTALL_ROOT/current"
cp -R "$SOURCE_DIR/." "$INSTALL_ROOT/current/"

for command_file in fl-tools fl-test; do
  target="$INSTALL_ROOT/current/scripts/$command_file"
  if [ ! -x "$target" ]; then
    echo "INSTALL=BLOCKED"
    echo "CAUSE=missing executable: $target" >&2
    exit 1
  fi
  link="$BIN_DIR/$command_file"
  if [ -e "$link" ] && [ ! -L "$link" ]; then
    echo "INSTALL=BLOCKED"
    echo "CAUSE=refusing to overwrite regular file: $link" >&2
    exit 1
  fi
  ln -sfn "$target" "$link"
done

if "$BIN_DIR/fl-tools" help >/dev/null 2>&1; then
  echo "INSTALL=PASS"
else
  echo "INSTALL=FAIL"
  exit 1
fi

case ":${PATH:-}:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo "PATH=NOT_CONFIGURED"
    echo "NEXT=export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
