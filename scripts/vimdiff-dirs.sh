#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <LEFT_DIR> <RIGHT_DIR>"
    exit 1
fi

expand_one() {
    shopt -s nullglob
    local matches=("$1")
    shopt -u nullglob

    if [[ ${#matches[@]} -ne 1 ]]; then
        echo "Error: '$1' expanded to ${#matches[@]} paths (expected exactly 1)"
        exit 1
    fi

    echo "${matches[0]}"
}

LEFT=$(expand_one "$1")
RIGHT=$(expand_one "$2")
THRESHOLD=5

LEFT=$(cd "$LEFT" && pwd -P)
RIGHT=$(cd "$RIGHT" && pwd -P)

while IFS= read -r line; do

    # Case 1: Files differ
    if [[ $line =~ ^Files\ (.*)\ and\ (.*)\ differ$ ]]; then
        left_file="${BASH_REMATCH[1]}"
        right_file="${BASH_REMATCH[2]}"

        clear

        diff_lines=$(diff -y --suppress-common-lines --strip-trailing-cr "$left_file" "$right_file" | wc -l)

        left_rel=${left_file#"$LEFT"/}
        right_rel=${right_file#"$RIGHT"/}

        echo "Files: rootA/$left_rel <-> rootB/$right_rel"
        echo "Changed lines: $diff_lines"

        if ((diff_lines > THRESHOLD)); then
            echo "Diff over $THRESHOLD lines - skipping preview"
        else
            diff --color=always --strip-trailing-cr "$left_file" "$right_file"
        fi

        printf "Edit? [y/N] "
        read -r answer </dev/tty

        case "$answer" in
        y | Y)
            nvim -d "$left_file" "$right_file" </dev/tty
            ;;
        *)
            echo "Skipping"
            ;;
        esac

    # Case 2: Only in LEFT
    elif [[ $line =~ ^Only\ in\ (.*):\ (.*)$ ]]; then
        dir="${BASH_REMATCH[1]}"
        file="${BASH_REMATCH[2]}"

        if [[ $dir == "$LEFT"* ]]; then
            src="$dir/$file"
            rel="${src#"$LEFT"/}"
            dst="$RIGHT/$rel"

            clear
            echo "Only in LEFT: $rel"
            printf "Copy LEFT -> RIGHT? [y/N] "
            read -r answer </dev/tty

            if [[ $answer =~ ^[yY]$ ]]; then
                mkdir -p "$(dirname "$dst")"
                cp -a "$src" "$dst"
                echo "Copied to $dst"
            else
                echo "Skipping"
            fi
        fi

        # Case 3: Only in RIGHT
        if [[ $dir == "$RIGHT"* ]]; then
            src="$dir/$file"
            rel="${src#"$RIGHT"/}"
            dst="$LEFT/$rel"

            clear
            echo "Only in RIGHT: $rel"
            printf "Copy RIGHT -> LEFT? [y/N] "
            read -r answer </dev/tty

            if [[ $answer =~ ^[yY]$ ]]; then
                mkdir -p "$(dirname "$dst")"
                cp -a "$src" "$dst"
                echo "Copied to $dst"
            else
                echo "Skipping"
            fi
        fi
    fi
done < <(diff -qr -x target -x node_modules "$LEFT" "$RIGHT" || true)
