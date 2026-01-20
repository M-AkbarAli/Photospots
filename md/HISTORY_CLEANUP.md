# Removing .env Files from Git History

This guide will help you completely remove `.env` files from your git history.

## ⚠️ IMPORTANT WARNINGS

1. **This rewrites git history** - All commit hashes will change
2. **You MUST force push to GitHub** after completing this
3. **Anyone who cloned the repo will need to re-clone** or rebase their work
4. **Backup your repository first!**

## Option 1: Using git-filter-repo (Recommended - Faster & Safer)

### Install git-filter-repo:
```bash
pip3 install git-filter-repo
```

### Remove .env files from history:
```bash
git filter-repo --path backend/.env --path backend/src/main/.env --path frontend/.env --path frontend/ios/.xcode.env --invert-paths --force
```

### Force push to GitHub:
```bash
git push origin --force --all
git push origin --force --tags  # if you have tags
```

## Option 2: Using git filter-branch (Built-in, Slower)

### Remove .env files from history:
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/.env backend/src/main/.env frontend/.env frontend/ios/.xcode.env" \
  --prune-empty --tag-name-filter cat -- --all
```

### Clean up backup refs:
```bash
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### Force push to GitHub:
```bash
git push origin --force --all
git push origin --force --tags  # if you have tags
```

## Verify the Removal

After running either method, verify the files are gone:

```bash
# This should return nothing
git log --all --full-history -- backend/.env frontend/.env

# Check that files still exist locally (they should)
ls -la backend/.env frontend/.env
```

## After Completion

1. ✅ Verify .env files are removed from history
2. ✅ Force push to GitHub
3. ✅ Update any collaborators to re-clone the repository
4. ✅ Consider rotating any secrets that were in the .env files (API keys, tokens, etc.)

## Rotating Secrets

Since your secrets were in git history, you should:
- Generate new Mapbox tokens
- Generate new JWT secrets
- Change any database passwords if they were in .env files
- Rotate any other API keys that were exposed

