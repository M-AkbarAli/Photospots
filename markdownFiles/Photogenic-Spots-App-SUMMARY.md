# Photogenic Spots App — Map-first Summary

## Purpose
A tiny, pragmatic mobile app that opens to a map homescreen, asks for location permission, recenters and zooms to the user's location, and shows nearby photogenic spots.

## Key idea (simplified)
- Homescreen is a full-screen map. No extra tabs or onboarding steps at first.
- On first open, request foreground location permission. If granted, center the map on the user and set an appropriate zoom (city/street level). If denied, show a compact fallback UI explaining why location is needed and let the user enter a location manually.
- Show nearby spots as clustered pins or simple markers. Tapping a marker opens a lightweight detail sheet (name, thumbnail, short tip, directions and save/favorite).

## Minimal UX flow
1) App opens to the map homescreen.
2) Ask for location permission (explain reason briefly in the request).  
3) On permission granted: get location, animate camera to user, fetch `GET /spots/nearby?lat&lng&radius` and render markers.  
4) On permission denied: show a small search/enter-location fallback and a button to re-open permission settings.

## Core API (suggested)
- `GET /spots/nearby?lat&lng&radius` — returns nearby spots ordered by score+distance.  
- `GET /spots/{id}` — spot details and sample photo.  
- `POST /spots` — user-submitted spot (lightweight UGC).

## Minimal Data Model
- `spots(id, name, lat, lng, categories[], score, photo_url, description, last_enriched_at)`

## Implementation notes (practical)
- Mobile: Expo + TypeScript + expo-router. Use `react-native-maps` (or Mapbox if you need advanced tiles later).  
- Location: `expo-location` for permissions + current position. Handle iOS/Android permission differences and background permission only later.  
- Markers: cluster on high-density areas; otherwise simple pins. Keep marker data small (id, lat, lng, title, thumbnail).  
- Fetch strategy: after centering to user, request nearby spots for a ~3km radius; re-query when user pans > ~500m or changes zoom level significantly.  
- Privacy: only send coordinates to your backend when fetching nearby spots — avoid uploading any extra device identifiers. Explain location usage in-app and keep precise location out of public shares (snapshots etc.).

## MVP (map-first)
- Full-screen map homescreen that requests location and recenters.  
- Nearby markers and lightweight detail sheet.  
- Save/favorite a spot (local + optional backend).  
- Add-a-spot flow with minimal fields (name, pin, optional photo).  

## Dev steps (short)
1) Scaffold Expo app with TypeScript and `expo-router`.  
2) Implement `MapScreen` that requests permission with `expo-location`, fetches location, and animates the map camera.  
3) Wire a simple `GET /spots/nearby` mock or Supabase endpoint and render markers.  
4) Implement the detail sheet and save flow.  

## Notes and next steps
- Keep things intentionally small: map-first UX reduces navigation complexity and gets users to the core value quickly.  
- After the map UX is solid, add list view, search, and richer ranking/enrichment.  
- If you want, I can scaffold `MapScreen` code and a minimal `GET /spots/nearby` mock next.
