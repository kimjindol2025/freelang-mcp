#!/bin/sh
set -eu

INSTALL_ROOT="${FREELANG_TOOLS_HOME:-${HOME:-}/.local/share/freelang-tools}"
BIN_DIR="${FREELANG_TOOLS_BIN:-${HOME:-}/.local/bin}"

for command_file in fl-tools fl-test; do
  link="$BIN_DIR/$command_file"
  if [ -L "$link" ]; then
    target="$(readlink "$link")"
    case "$target" in
      "$INSTALL_ROOT"/*) rm -f "$link" ;;
    esac
  fi
done

rm -rf "$INSTALL_ROOT"
echo "UNINSTALL=PASS"
