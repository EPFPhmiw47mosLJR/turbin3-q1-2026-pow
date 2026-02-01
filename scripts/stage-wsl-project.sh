#!/usr/bin/env bash
set -euo pipefail


if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <SRC_DIR> <DST_DIR>"
    exit 1
fi

expand_one() {
    shopt -s nullglob
    local matches=($1)
    shopt -u nullglob

    if [[ ${#matches[@]} -ne 1 ]]; then
        echo "Error: '$1' expanded to ${#matches[@]} paths (expected exactly 1)"
        exit 1
    fi

    echo "${matches[0]}"
}

SRC=$(expand_one "$1")
DST=$(expand_one "$2")


if [[ ! -d "$SRC" ]]; then
    echo "Source does not exist: $SRC"
    exit 1
fi


RSYNC_FILTERS=(
    "--filter=+ *wallet.json"
    "--filter=:- .gitignore"
)


if [[ ! -d "$DST" ]]; then
    echo "Destination does not exist. Creating fresh copy."
    mkdir -p "$DST"
    rsync -a \
        "${RSYNC_FILTERS[@]}" \
        "$SRC/" "$DST/"
else
    echo "Checking for differences…"

    if rsync -ain --delete \
        "${RSYNC_FILTERS[@]}" \
        "$SRC/" "$DST/" |
        grep -q .; then

        echo
        read -r -p "Differences detected. Overwrite destination completely? [y/N] " confirm

        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 1
        fi

        echo "Removing destination…"
        rm -rf "$DST"
        mkdir -p "$DST"

        echo "Copying fresh tree…"
        rsync -a \
            "${RSYNC_FILTERS[@]}" \
            "$SRC/" "$DST/"
    else
        echo "No differences detected. Nothing to do."
        exit 0
    fi
fi


echo "Running cargo clean where applicable…"

find "$DST" -name Cargo.toml -print0 |
while IFS= read -r -d '' toml; do
    dir=$(dirname "$toml")
    echo "  cargo clean in $dir"
    (cd "$dir" && cargo clean)
done

echo "Done."
