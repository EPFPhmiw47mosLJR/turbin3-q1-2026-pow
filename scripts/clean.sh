#!/usr/bin/env bash
set -euo pipefail

usage() {
    me=$(basename "$0")
    cat <<EOF
Usage:
$me <path> [--depth N] [--apply]

Defaults:
  - Dry-run mode (no changes)
  - Depth = 2

Options:
  <path>        Root directory to scan (required)
  --depth N    Max directory depth (default: 5)
  --apply      Actually perform deletions
EOF
    exit 1
}

[[ $# -lt 1 ]] && usage

ROOT="$1"
shift

MAX_DEPTH=2
APPLY=0

while [[ $# -gt 0 ]]; do
    case "$1" in
    --depth)
        MAX_DEPTH="${2:-}"
        [[ -z "$MAX_DEPTH" ]] && usage
        shift 2
        ;;
    --apply)
        APPLY=1
        shift
        ;;
    *)
        usage
        ;;
    esac
done

[[ -d "$ROOT" ]] || {
    echo "Error: '$ROOT' is not a directory"
    exit 1
}

echo "Root:      $ROOT"
echo "Max depth: $MAX_DEPTH"
echo "Mode:      $([[ "$APPLY" == "1" ]] && echo APPLY || echo DRY-RUN)"
echo

echo
echo "=== Cargo projects ==="

find "$ROOT" \
    -mindepth 1 \
    -maxdepth "$MAX_DEPTH" \
    -name Cargo.toml \
    -print |
    while IFS= read -r cargo_toml; do
        proj_dir="$(dirname "$cargo_toml")"

        echo "Cargo project: $proj_dir"

        if [[ "$APPLY" == "1" ]]; then
            (cd "$proj_dir" && cargo clean)
        else
            echo "  Would run: cargo clean"
        fi
    done

echo
echo "=== Node projects ==="

find "$ROOT" \
    -mindepth 1 \
    -maxdepth "$MAX_DEPTH" \
    -name package.json \
    -print |
    while IFS= read -r pkg; do
        proj_dir="$(dirname "$pkg")"
        nm="$proj_dir/node_modules"

        if [[ -d "$nm" ]]; then
            if [[ "$APPLY" == "1" ]]; then
                echo "Removing: $nm"
                rm -rf "$nm"
            else
                echo "Would remove: $nm"
            fi
        fi
    done
