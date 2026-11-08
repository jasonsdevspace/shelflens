#!/usr/bin/env bash
# Creates the GitHub release for a tag, with the version's changelog entry as
# its notes, for the release workflow. A release that already exists is left
# alone, so a run can be repeated after a later step failed.
#
#   scripts/github-release.sh <tag> <version> <changelog> <title> [gh release flags]
#
# NOTES_LEAD, when set, is a paragraph put above the entry, such as how to
# install the version. Needs GH_TOKEN with permission to write contents.
set -euo pipefail

tag="$1"
version="$2"
changelog="$3"
title="$4"
shift 4

# What it did, written to the run's page when it runs in one.
url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/releases/tag/$tag"
said() {
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
        printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY" || true
    fi
}

if gh release view "$tag" >/dev/null 2>&1; then
    echo "the release for $tag exists"
    said "### On GitHub"$'\n\n'"[$title]($url) was already released, so it was left as it is."
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
if [ -n "${NOTES_LEAD:-}" ]; then
    { printf '%s\n\n' "$NOTES_LEAD"; cat notes.md; } > notes-with-lead.md
    mv notes-with-lead.md notes.md
fi

gh release create "$tag" --title "$title" --notes-file notes.md "$@"
said "### Released on GitHub"$'\n\n'"[$title]($url), with the changelog entry as its notes."
