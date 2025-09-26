# Mapbox Setup Instructions

## Required: Get Mapbox Access Token

1. **Create a Mapbox account** at https://account.mapbox.com/
2. **Get your access tokens:**
   - **Public token** (starts with `pk.`) - for map rendering
   - **Download token** (starts with `sk.`) - for SDK downloads during build

## Configure tokens:

### Option 1: Environment variables (recommended)
Create `.env` file in project root:
```
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_token_here
MAPBOX_DOWNLOAD_TOKEN=sk.your_download_token_here
```

### Option 2: Direct in app.json
Replace `MAPBOX_DOWNLOAD_TOKEN_PLACEHOLDER` in app.json with your actual download token.

## Next steps:
1. Run `npx expo prebuild` to generate native code
2. Run `npx expo run:ios` or `npx expo run:android` to test on device/simulator

**Note:** @rnmapbox/maps requires native compilation, so you can't use Expo Go. You'll need to use development builds or run on device/simulator directly.
