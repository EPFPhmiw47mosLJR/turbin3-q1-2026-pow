#!/usr/bin/env bash
# set -euo pipefail

if [[ $# -ne 2 ]]; then
	echo "Usage: $0 <LEFT_DIR> <RIGHT_DIR>"
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

LEFT=$(expand_one "$1")
RIGHT=$(expand_one "$2")
THRESHOLD=5

LEFT=$(cd "$LEFT" && pwd -P)
RIGHT=$(cd "$RIGHT" && pwd -P)

( diff -qr \
	-x target \
	-x node_modules \
	"$LEFT" \
    "$RIGHT" || true ) |
	sed -n 's/^Files \(.*\) and \(.*\) differ$/\1\t\2/p' |
    while IFS=$'\t' read -r left_file right_file; do
        clear

        diff_lines=$(diff -y --suppress-common-lines --strip-trailing-cr "$left_file" "$right_file" | wc -l)

        left_rel=${left_file#"$LEFT"/}
        right_rel=${right_file#"$RIGHT"/}

        echo "Files: rootA/$left_rel <-> rootB/$right_rel"
        echo "Changed lines: $diff_lines"

        if (( diff_lines > THRESHOLD )); then
            echo "Diff over $THRESHOLD lines - skipping preview"
        else
            diff --color=always --strip-trailing-cr "$left_file" "$right_file"
        fi

        printf "Edit? [y/N] "
        read -r answer </dev/tty

        case "$answer" in
            y|Y)
                nvim -d "$left_file" "$right_file" </dev/tty
                ;;
            *)
                echo "Skipping"
                ;;
        esac
    done

