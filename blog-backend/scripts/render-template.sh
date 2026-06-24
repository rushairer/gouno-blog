#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <destination> <module-path> <project-name>" >&2
  exit 2
fi

dest="$1"
module_path="$2"
project_name="$3"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export MODULE_PATH="$module_path"
export PROJECT_NAME="$project_name"

rm -rf "$dest"
mkdir -p "$dest"

rsync -a \
  --exclude ".git" \
  --exclude "bin" \
  --exclude "log/*" \
  --exclude "data" \
  "$root/" "$dest/"

find "$dest" -type f -print0 | while IFS= read -r -d '' file; do
  if LC_ALL=C grep -Iq . "$file"; then
    perl -0pi -e 's/\{\{\.ModulePath\}\}/$ENV{"MODULE_PATH"}/g; s/\{\{\.ProjectName\}\}/$ENV{"PROJECT_NAME"}/g' "$file"
  fi
done
