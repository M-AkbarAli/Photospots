import Mapbox from '@rnmapbox/maps';
import React, { useCallback, useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { normalizeImageUrl } from '../../lib/api';
import type { Spot } from '../../types/api';

// Marker size and styling (matching reference image #3)
const MARKER_SIZE = 48;
const MARKER_BORDER_RADIUS = 10;
const MARKER_BORDER_WIDTH = 2;
const MARKER_BORDER_COLOR = '#FFFFFF';
const PLACEHOLDER_BG = 'rgba(60, 60, 67, 0.9)';

interface MapMarkersProps {
  landmarks: Spot[];
  selectedSpotId: string | null;
  userLocation: [number, number] | null;
  onMarkerPress: (landmark: Spot) => void;
  maxMarkers?: number;
}

interface MarkerImageProps {
  spot: Spot;
  isSelected: boolean;
  onPress: () => void;
}

function MarkerImage({ spot, isSelected, onPress }: MarkerImageProps) {
  const photoUrl = normalizeImageUrl(spot.photoUrl);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.markerContainer,
        isSelected && styles.markerSelected,
      ]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.markerImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.markerPlaceholder} />
      )}
    </Pressable>
  );
}

export function MapMarkers({
  landmarks,
  selectedSpotId,
  userLocation,
  onMarkerPress,
  maxMarkers = 30,
}: MapMarkersProps) {
  // Sort by score desc or distance asc and limit markers
  const visibleSpots = useMemo(() => {
    const sorted = [...landmarks].sort((a, b) => {
      // Prioritize by distance if available, then by score
      if (a.distanceMeters !== undefined && b.distanceMeters !== undefined) {
        return a.distanceMeters - b.distanceMeters;
      }
      return (b.score || 0) - (a.score || 0);
    });
    return sorted.slice(0, maxMarkers);
  }, [landmarks, maxMarkers]);

  const handleMarkerPress = useCallback(
    (spot: Spot) => {
      onMarkerPress(spot);
    },
    [onMarkerPress]
  );

  return (
    <>
      {visibleSpots.map((spot) => (
        <Mapbox.MarkerView
          key={spot.id}
          id={`marker-${spot.id}`}
          coordinate={[spot.longitude, spot.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          allowOverlap
          allowOverlapWithPuck
        >
          <MarkerImage
            spot={spot}
            isSelected={spot.id === selectedSpotId}
            onPress={() => handleMarkerPress(spot)}
          />
        </Mapbox.MarkerView>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  markerContainer: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_BORDER_RADIUS,
    borderWidth: MARKER_BORDER_WIDTH,
    borderColor: MARKER_BORDER_COLOR,
    overflow: 'hidden',
    backgroundColor: PLACEHOLDER_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  markerSelected: {
    borderWidth: 3,
    transform: [{ scale: 1.1 }],
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  markerPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: PLACEHOLDER_BG,
  },
});
