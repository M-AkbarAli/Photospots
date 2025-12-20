import BottomSheet from '@gorhom/bottom-sheet';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SearchPill } from '../../components/Map/SearchPill';
import { SearchThisAreaPill } from '../../components/Map/SearchThisAreaPill';
import { SpotLayers, type SpotLayersRef } from '../../components/Map/SpotLayers';
import { SpotBottomSheet } from '../../components/Spot/SpotBottomSheet';
import { THEME } from '../../constants/theme';
import { getNearbySpots } from '../../lib/api';
import { distanceFromCoordinates } from '../../lib/geo';
import {
  getHasFetchedOnce,
  getLastFetchedCenter,
  setHasFetchedOnce,
  setLastFetchedCenter,
} from '../../lib/storage';
import type { Spot } from '../../types/api';

// Set Mapbox access token
Mapbox.setAccessToken(
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.demo_token'
);

// NOTE: The "[MapboxCommon] Invalid size" warning during app launch is a known
// harmless issue in @rnmapbox/maps. It occurs at the native iOS level before
// React Native's layout system provides dimensions. The map displays correctly
// after the initial frame. See: https://github.com/rnmapbox/maps/issues/3876

// Toronto fallback
const TORONTO_COORDS: [number, number] = [-79.3832, 43.6532];
const DEFAULT_ZOOM = 13;
const SEARCH_RADIUS_METERS = 1500;
const DISTANCE_THRESHOLD_METERS = 400;
const ZOOM_THRESHOLD = 1.0;

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    selectedSpotId?: string;
    centerLng?: string;
    centerLat?: string;
  }>();

  // Refs
  const cameraRef = useRef<Mapbox.Camera>(null);
  const spotLayersRef = useRef<SpotLayersRef>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch nearby spots
  const performFetch = useCallback(
    async (center: [number, number], zoom: number) => {
      setIsSearching(true);
      setErrorBanner(null);

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
        setErrorBanner("Couldn't load spots. Try again.");
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
            const location = await Promise.race([
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              }),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('Location timeout')),
                  5000
                )
              ),
            ]);

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

          // Auto-fetch only on first ever run
          if (!hasFetched) {
            await performFetch(coords, DEFAULT_ZOOM);
          }
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

  // Handle cluster tap
  const handleClusterTap = useCallback(
    (coordinates: [number, number], expansionZoom: number) => {
      if (isCameraAnimatingRef.current) return;

      isCameraAnimatingRef.current = true;

      cameraRef.current?.setCamera({
        centerCoordinate: coordinates,
        zoomLevel: Math.min(expansionZoom + 0.5, 20),
        animationDuration: 600,
      });

      // Reset animation lock after animation completes
      setTimeout(() => {
        isCameraAnimatingRef.current = false;
      }, 650);
    },
    []
  );

  // Handle bottom sheet close
  const handleBottomSheetClose = useCallback(() => {
    setSelectedSpotId(null);
  }, []);

  // Navigate to search screen
  const handleSearchPress = useCallback(() => {
    // @ts-expect-error - route exists but types not regenerated
    router.push('/search');
  }, [router]);

  // Get selected spot data for bottom sheet
  const selectedSpot = spots.find((s) => s.id === selectedSpotId) || null;

  return (
    <GestureHandlerRootView style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
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

        {/* Spot markers */}
        <SpotLayers
          ref={spotLayersRef}
          spots={spots}
          selectedSpotId={selectedSpotId}
          onSpotSelect={handleSpotSelect}
          onClusterTap={handleClusterTap}
        />
      </Mapbox.MapView>

      {/* Location denied banner */}
      {locationDenied && (
        <View style={styles.locationBanner}>
          <Text style={styles.locationBannerText}>
            Using default location — enable location for nearby spots.
          </Text>
        </View>
      )}

      {/* Error banner */}
      {errorBanner && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorBanner}</Text>
        </View>
      )}

      {/* Top search pill */}
      <View style={styles.topPillContainer}>
        <SearchPill onPress={handleSearchPress} />
      </View>

      {/* Search this area pill */}
      {showSearchPill && (
        <View style={styles.searchAreaContainer}>
          <SearchThisAreaPill
            onPress={handleSearchThisArea}
            isLoading={isSearching}
          />
        </View>
      )}

      {/* Spot bottom sheet */}
      {selectedSpotId && (
        <SpotBottomSheet
          spotId={selectedSpotId}
          initialSpot={selectedSpot}
          bottomSheetRef={bottomSheetRef}
          onClose={handleBottomSheetClose}
        />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  locationBanner: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: THEME.CARD,
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
    color: THEME.TEXT_MUTED,
    textAlign: 'center',
  },
  errorBanner: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#DC2626',
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
