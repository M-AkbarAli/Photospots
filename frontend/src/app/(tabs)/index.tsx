import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { MainBottomSheet, type MainBottomSheetRef } from '../../components/MainBottomSheet';
import { MapMarkers } from '../../components/Map/MapMarkers';
import { SearchPill } from '../../components/Map/SearchPill';
import { SearchThisAreaPill } from '../../components/Map/SearchThisAreaPill';
import { useTheme } from '../../constants/theme';
import { filterLandmarks, getNearbySpots } from '../../lib/api';
import { distanceFromCoordinates } from '../../lib/geo';
import {
  getHasFetchedOnce,
  getLastFetchedCenter,
  setHasFetchedOnce,
  setLastFetchedCenter,
} from '../../lib/storage';
import type { Spot } from '../../types/api';

// Set Mapbox access token (must be set via EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in .env)
const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (!mapboxToken) {
  console.warn(
    '[Mapbox] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is not set. ' +
    'Add it to frontend/.env for the map to work correctly.'
  );
}
Mapbox.setAccessToken(mapboxToken || '');

// NOTE: The "[MapboxCommon] Invalid size" warning during app launch is a known
// harmless issue in @rnmapbox/maps. It occurs at the native iOS level before
// React Native's layout system provides dimensions. The map displays correctly
// after the initial frame. See: https://github.com/rnmapbox/maps/issues/3876

// Toronto fallback
const TORONTO_COORDS: [number, number] = [-79.3832, 43.6532];
const DEFAULT_ZOOM = 11.5;
const SEARCH_RADIUS_METERS = 5000; // 5km radius for landmark-first experience
const DISTANCE_THRESHOLD_METERS = 400;
const ZOOM_THRESHOLD = 1.0;

// Use the custom Warm map style (hosted on Mapbox)
const WARM_STYLE_URL = 'mapbox://styles/makbarali/cmjru8opm000d01s2f9y80ii7';

export default function MapScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{
    selectedSpotId?: string;
    centerLng?: string;
    centerLat?: string;
  }>();

  useEffect(() => {
    console.log('[Map] styleURL', WARM_STYLE_URL);
    console.log('[Map] token set', !!mapboxToken);
  }, []);

  // Refs
  const cameraRef = useRef<Mapbox.Camera>(null);
  const bottomSheetRef = useRef<MainBottomSheetRef>(null);
  const isCameraAnimatingRef = useRef(false);

  // Location state
  const [userCoordinates, setUserCoordinates] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(TORONTO_COORDS);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [locationDenied, setLocationDenied] = useState(false);

  // Spots state
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [lastFetchedCenter, setLastFetchedCenterState] = useState<[number, number] | null>(null);
  const [lastFetchedZoom, setLastFetchedZoom] = useState<number>(DEFAULT_ZOOM);

  // UI state
  const [showSearchPill, setShowSearchPill] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Filter spots to landmarks only and sort by proximity to the user's location (fallback to last fetch center)
  const landmarks = useMemo(() => {
    const base = filterLandmarks(spots);
    const origin = userCoordinates || lastFetchedCenter || TORONTO_COORDS;

    if (!origin) return base;

    return [...base].sort((a, b) => {
      const distA = distanceFromCoordinates([a.longitude, a.latitude], origin);
      const distB = distanceFromCoordinates([b.longitude, b.latitude], origin);
      return distA - distB;
    });
  }, [spots, userCoordinates, lastFetchedCenter]);

  // Fetch nearby spots (landmarks only)
  const performFetch = useCallback(
    async (center: [number, number], zoom: number) => {
      setIsSearching(true);
      setFetchError(null);

      try {
        const data = await getNearbySpots(center[1], center[0], SEARCH_RADIUS_METERS);
        setSpots(data);
        setLastFetchedCenterState(center);
        setLastFetchedZoom(zoom);
        setShowSearchPill(false);

        // Persist
        await setHasFetchedOnce(true);
        await setLastFetchedCenter(center);
      } catch (error) {
        console.error('Fetch failed:', error);
        setFetchError("Couldn't load landmarks. Try again.");
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // Initialize location and check first fetch
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        // Request location permission
        const { status } = await Location.requestForegroundPermissionsAsync();

        let coords: [number, number] = TORONTO_COORDS;

        if (status !== 'granted') {
          if (mounted) {
            setLocationDenied(true);
            setMapCenter(TORONTO_COORDS);
            setUserCoordinates(TORONTO_COORDS);
          }
        } else {
          // Get current location with timeout
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });

            if (mounted && location?.coords) {
              coords = [
                location.coords.longitude,
                location.coords.latitude,
              ];
              console.log('User location obtained:', coords);
              setUserCoordinates(coords);
              setMapCenter(coords);
            }
          } catch (locError) {
            console.warn('Failed to get current location:', locError);
            // Keep using TORONTO_COORDS as fallback
            if (mounted) {
              console.log('Using fallback location (Toronto)');
              setUserCoordinates(TORONTO_COORDS);
              setMapCenter(TORONTO_COORDS);
            }
          }
        }

        // Check if we should auto-fetch
        const hasFetched = await getHasFetchedOnce();
        const storedCenter = await getLastFetchedCenter();

        if (storedCenter) {
          setLastFetchedCenterState(storedCenter);
        }

        if (mounted) {
          setIsInitialized(true);

          // Auto-fetch landmarks on app load
          await performFetch(coords, DEFAULT_ZOOM);
        }
      } catch (error) {
        console.warn('Initialization error:', error);
        if (mounted) {
          setLocationDenied(true);
          setMapCenter(TORONTO_COORDS);
          setUserCoordinates(TORONTO_COORDS);
          setIsInitialized(true);
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [performFetch]);

  // Handle params from search screen
  useEffect(() => {
    if (params.selectedSpotId && params.centerLng && params.centerLat) {
      const lng = parseFloat(params.centerLng);
      const lat = parseFloat(params.centerLat);

      if (!isNaN(lng) && !isNaN(lat)) {
        // Animate to the selected spot
        cameraRef.current?.setCamera({
          centerCoordinate: [lng, lat],
          zoomLevel: 15,
          animationDuration: 600,
        });

        // Select the spot and open bottom sheet
        setSelectedSpotId(params.selectedSpotId);
        bottomSheetRef.current?.snapToIndex(1);
      }
    }
  }, [params.selectedSpotId, params.centerLng, params.centerLat]);

  useEffect(() => {
    if (userCoordinates) {
      cameraRef.current?.setCamera({
        centerCoordinate: userCoordinates,
        zoomLevel: DEFAULT_ZOOM,
        animationDuration: 600,
      });
      setMapCenter(userCoordinates);
    }
  }, [userCoordinates]);

  // Handle "Search this area" press
  const handleSearchThisArea = useCallback(() => {
    performFetch(mapCenter, currentZoom);
  }, [mapCenter, currentZoom, performFetch]);

  // Handle map camera changes
  const handleCameraChanged = useCallback((state: any) => {
    if (state?.properties?.center) {
      setMapCenter(state.properties.center as [number, number]);
    }
    if (state?.properties?.zoom !== undefined) {
      setCurrentZoom(state.properties.zoom);
    }
  }, []);

  // Handle map idle (movement stopped)
  const handleMapIdle = useCallback(
    (state: any) => {
      if (!isInitialized || !lastFetchedCenter) return;

      const currentCenter = state?.properties?.center as [number, number] | undefined;
      const currentZoomLevel = state?.properties?.zoom as number | undefined;

      if (!currentCenter) return;

      // Calculate distance from last fetched center
      const distance = distanceFromCoordinates(currentCenter, lastFetchedCenter);
      const zoomDelta = Math.abs((currentZoomLevel || currentZoom) - lastFetchedZoom);

      // Show pill if moved far enough or zoomed significantly
      if (distance >= DISTANCE_THRESHOLD_METERS || zoomDelta >= ZOOM_THRESHOLD) {
        setShowSearchPill(true);
      } else {
        setShowSearchPill(false);
      }

      // Check if selected spot is now clustered (zoomed out)
      if (selectedSpotId && currentZoomLevel && currentZoomLevel < 12) {
        // Close sheet if zoomed out too far
        setSelectedSpotId(null);
        bottomSheetRef.current?.close();
      }
    },
    [isInitialized, lastFetchedCenter, lastFetchedZoom, currentZoom, selectedSpotId]
  );

  // Handle spot selection
  const handleSpotSelect = useCallback((spotId: string) => {
    setSelectedSpotId(spotId);
    bottomSheetRef.current?.snapToIndex(1);
  }, []);

  // Handle landmark selection from panel or markers
  const handleLandmarkSelect = useCallback((landmark: Spot) => {
    // Animate to the landmark
    cameraRef.current?.setCamera({
      centerCoordinate: [landmark.longitude, landmark.latitude],
      zoomLevel: 15,
      animationDuration: 600,
    });
    // Open the details sheet
    setSelectedSpotId(landmark.id);
    bottomSheetRef.current?.snapToIndex(1);
  }, []);

  // Handle marker press (from MapMarkers)
  const handleMarkerPress = useCallback((landmark: Spot) => {
    handleLandmarkSelect(landmark);
  }, [handleLandmarkSelect]);

  // Handle bottom sheet close
  const handleBottomSheetClose = useCallback(() => {
    setSelectedSpotId(null);
  }, []);

  // Handle retry fetch from panel
  const handleRetryFetch = useCallback(() => {
    performFetch(mapCenter, currentZoom);
  }, [performFetch, mapCenter, currentZoom]);

  // Navigate to search screen
  const handleSearchPress = useCallback(() => {
    router.push('/search');
  }, [router]);

  // Get selected spot data for bottom sheet
  const selectedSpot = spots.find((s) => s.id === selectedSpotId) || null;

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: theme.BG }]}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={WARM_STYLE_URL}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onDidFinishLoadingStyle={() => console.log('[Map] style loaded')}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: mapCenter,
            zoomLevel: DEFAULT_ZOOM,
          }}
        />

        {/* Landmark markers (image-only squares with white border) */}
        <MapMarkers
          landmarks={landmarks}
          selectedSpotId={selectedSpotId}
          userLocation={userCoordinates}
          onMarkerPress={handleMarkerPress}
        />
      </Mapbox.MapView>

      {/* Location denied banner */}
      {locationDenied && !selectedSpotId && (
        <View style={[styles.locationBanner, { backgroundColor: theme.CARD }]}>
          <Text style={[styles.locationBannerText, { color: theme.TEXT_MUTED }]}>
            Using default location — enable location for nearby landmarks.
          </Text>
        </View>
      )}

      {/* Top search pill - hidden when landmark selected */}
      {!selectedSpotId && (
        <View style={styles.topPillContainer}>
          <SearchPill onPress={handleSearchPress} onRefresh={handleSearchThisArea} />
        </View>
      )}

      {/* Search this area pill */}
      {showSearchPill && !selectedSpotId && (
        <View style={styles.searchAreaContainer}>
          <SearchThisAreaPill
            onPress={handleSearchThisArea}
            isLoading={isSearching}
          />
        </View>
      )}

      {/* Unified bottom sheet (Browse + Details) */}
      <MainBottomSheet
        ref={bottomSheetRef}
        landmarks={landmarks}
        selectedSpotId={selectedSpotId}
        initialSpot={selectedSpot}
        loading={isSearching}
        error={fetchError}
        onSelectLandmark={handleLandmarkSelect}
        onClose={handleBottomSheetClose}
        onRetry={handleRetryFetch}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  locationBanner: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationBannerText: {
    fontSize: 13,
    textAlign: 'center',
  },
  topPillContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
  },
  searchAreaContainer: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
  },
});
