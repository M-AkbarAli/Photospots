import Mapbox from '@rnmapbox/maps';
import React, { useCallback, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { normalizeImageUrl } from '../../lib/api';
import type { Spot } from '../../types/api';

// Marker visuals (image + label stack)
const MARKER_SIZE = 48;
const MARKER_BORDER_RADIUS = 12;
const MARKER_BORDER_WIDTH = 2;
const MARKER_BORDER_COLOR = '#FFFFFF';
const PLACEHOLDER_BG = 'rgba(60, 60, 67, 0.9)';
const LABEL_BG = 'rgba(44, 44, 46, 0.90)';
const LABEL_BORDER = 'rgba(255, 255, 255, 0.10)';
const LABEL_TEXT = 'rgba(235, 235, 245, 0.92)';
const LABEL_MAX_WIDTH = 160;

// Photospot (niche discovery) marker size - slightly smaller
const PHOTOSPOT_SIZE = 40;

interface MapMarkersProps {
  landmarks: Spot[];
  photospots?: Spot[];
  selectedSpotId: string | null;
  userLocation: [number, number] | null;
  onMarkerPress: (landmark: Spot) => void;
  maxMarkers?: number;
  maxPhotospots?: number;
}

interface MarkerStackProps {
  spot: Spot;
  isSelected: boolean;
  onPress: () => void;
}

interface PhotospotMarkerProps {
  spot: Spot;
  isSelected: boolean;
  onPress: () => void;
}

function MarkerStack({ spot, isSelected, onPress }: MarkerStackProps) {
  const photoUrl = normalizeImageUrl(spot.photoUrl);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.stackContainer, isSelected && styles.stackSelected]}
    >
      <View style={[styles.markerContainer, isSelected && styles.markerSelected]}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.markerImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.markerPlaceholder} />
        )}
      </View>

      <View style={styles.labelPill}>
        <Text
          style={styles.labelText}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {spot.name}
        </Text>
      </View>
    </Pressable>
  );
}

// Photospot marker - image only, no label (for niche discoveries)
function PhotospotMarker({ spot, isSelected, onPress }: PhotospotMarkerProps) {
  const photoUrl = normalizeImageUrl(spot.photoUrl);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.photospotContainer, isSelected && styles.photospotSelected]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.photospotImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.photospotPlaceholder} />
      )}
    </Pressable>
  );
}

export function MapMarkers({
  landmarks,
  photospots = [],
  selectedSpotId,
  userLocation,
  onMarkerPress,
  maxMarkers = 30,
  maxPhotospots = 20,
}: MapMarkersProps) {
  // Sort by score desc or distance asc and limit markers
  const visibleLandmarks = useMemo(() => {
    const sorted = [...landmarks].sort((a, b) => {
      // Prioritize by distance if available, then by score
      if (a.distanceMeters !== undefined && b.distanceMeters !== undefined) {
        return a.distanceMeters - b.distanceMeters;
      }
      return (b.score || 0) - (a.score || 0);
    });
    return sorted.slice(0, maxMarkers);
  }, [landmarks, maxMarkers]);

  const visiblePhotospots = useMemo(() => {
    const sorted = [...photospots].sort((a, b) => {
      if (a.distanceMeters !== undefined && b.distanceMeters !== undefined) {
        return a.distanceMeters - b.distanceMeters;
      }
      return (b.score || 0) - (a.score || 0);
    });
    return sorted.slice(0, maxPhotospots);
  }, [photospots, maxPhotospots]);

  const handleMarkerPress = useCallback(
    (spot: Spot) => {
      onMarkerPress(spot);
    },
    [onMarkerPress]
  );

  return (
    <>
      {/* Render photospots first (behind landmarks) - image only, no label */}
      {visiblePhotospots.map((spot) => (
        <Mapbox.MarkerView
          key={`photospot-${spot.id}`}
          id={`photospot-${spot.id}`}
          coordinate={[spot.longitude, spot.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          allowOverlap={false}
          allowOverlapWithPuck
        >
          <PhotospotMarker
            spot={spot}
            isSelected={spot.id === selectedSpotId}
            onPress={() => handleMarkerPress(spot)}
          />
        </Mapbox.MarkerView>
      ))}
      
      {/* Render landmarks on top with labels */}
      {visibleLandmarks.map((spot) => (
        <Mapbox.MarkerView
          key={`marker-${spot.id}`}
          id={`marker-${spot.id}`}
          coordinate={[spot.longitude, spot.latitude]}
          anchor={{ x: 0.5, y: 1 }}
          allowOverlap
          allowOverlapWithPuck
        >
          <MarkerStack
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
  stackContainer: {
    alignItems: 'center',
    gap: 6,
    transform: [{ scale: 1 }],
  },
  stackSelected: {
    transform: [{ scale: 1.05 }],
  },
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
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  markerSelected: {
    borderWidth: 3,
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
  labelPill: {
    maxWidth: LABEL_MAX_WIDTH,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: LABEL_BG,
    borderWidth: 1,
    borderColor: LABEL_BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  labelText: {
    color: LABEL_TEXT,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Photospot styles (niche discoveries - image only, no label)
  photospotContainer: {
    width: PHOTOSPOT_SIZE,
    height: PHOTOSPOT_SIZE,
    borderRadius: PHOTOSPOT_SIZE / 2,
    borderWidth: 2,
    borderColor: MARKER_BORDER_COLOR,
    overflow: 'hidden',
    backgroundColor: PLACEHOLDER_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  photospotSelected: {
    borderWidth: 3,
    transform: [{ scale: 1.15 }],
  },
  photospotImage: {
    width: '100%',
    height: '100%',
  },
  photospotPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: PLACEHOLDER_BG,
  },
});
