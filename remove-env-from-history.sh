#!/bin/bash
# Script to remove .env files from git history
# WARNING: This rewrites git history. Make sure you have a backup!

set -e

echo "⚠️  WARNING: This will rewrite your git history!"
echo "⚠️  Make sure you have a backup and are on the correct branch."
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Removing .env files from git history..."

# Remove the files from all commits in history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env backend/src/main/.env frontend/.env frontend/ios/.xcode.env" \
  --prune-empty --tag-name-filter cat -- --all

echo ""
echo "✅ Done! History has been rewritten."
echo ""
echo "Next steps:"
echo "1. Verify the changes: git log --all -- backend/.env"
echo "2. Force push to GitHub: git push origin --force --all"
echo "3. Force push tags (if any): git push origin --force --tags"
echo ""
echo "⚠️  IMPORTANT: Anyone who cloned this repo will need to re-clone it!"

