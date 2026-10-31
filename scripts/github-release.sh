#!/usr/bin/env bash
# Creates the GitHub release for a tag, with the version's changelog entry as
# its notes, for the release workflow. A release that already exists is left
# alone, unless a canceled run left it as a draft, which is then published.
#
#   scripts/github-release.sh <tag> <version> <changelog> <title> [gh release flags]
#
# Needs GH_TOKEN with permission to write contents.
set -euo pipefail

tag="$1"
version="$2"
changelog="$3"
title="$4"
shift 4

if gh release view "$tag" >/dev/null 2>&1; then
    if [ "$(gh release view "$tag" --json isDraft -q .isDraft)" = "true" ]; then
        gh release edit "$tag" --draft=false
        echo "the release for $tag was a draft, and is published now"
    else
        echo "the release for $tag exists"
    fi
    exit 0
fi

# The lines under "## <version>" up to the next version's heading, with the
# blank lines at the start dropped.
awk -v v="$version" '
    $0 == "## " v { on = 1; next }
    on && /^## / { exit }
    on && (printed || NF) { print; printed = 1 }
' "$changelog" > notes.md
if ! grep -q . notes.md; then
    echo "the changelog entry for $version in $changelog is empty"
    exit 1
fi

gh release create "$tag" --title "$title" --notes-file notes.md "$@"
