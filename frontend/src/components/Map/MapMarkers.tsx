import Mapbox from '@rnmapbox/maps';
import React, { useCallback, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import { normalizeImageUrl } from '../../lib/api';
import type { Spot } from '../../types/api';

interface MapMarkersProps {
  landmarks: Spot[];
  selectedSpotId: string | null;
  userLocation: [number, number] | null;
  onMarkerPress: (landmark: Spot) => void;
  maxMarkers?: number;
}

interface MarkerCalloutProps {
  spot: Spot;
  isSelected: boolean;
  onPress: () => void;
}

function formatDistance(meters?: number): string {
  if (!meters) return '';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function MarkerCallout({ spot, isSelected, onPress }: MarkerCalloutProps) {
  const theme = useTheme();
  const photoUrl = normalizeImageUrl(spot.photoUrl);

  const containerStyle = useMemo(
    () => [
      styles.calloutContainer,
      {
        backgroundColor: theme.MARKER_BG,
        borderColor: isSelected ? theme.ACCENT : theme.MARKER_BORDER,
        borderWidth: isSelected ? 2 : 1,
        transform: [{ scale: isSelected ? 1.05 : 1 }],
      },
    ],
    [theme, isSelected]
  );

  return (
    <Pressable onPress={onPress} style={containerStyle}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.thumbnail}
          onError={() => {}}
        />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
          <Text style={[styles.placeholderIcon, { color: theme.TEXT_MUTED }]}>📍</Text>
        </View>
      )}
      <View style={styles.textContainer}>
        <Text
          style={[styles.title, { color: theme.TEXT }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {spot.name}
        </Text>
        {spot.distanceMeters !== undefined && (
          <Text style={[styles.distance, { color: theme.TEXT_MUTED }]}>
            {formatDistance(spot.distanceMeters)}
          </Text>
        )}
      </View>
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
          anchor={{ x: 0.5, y: 1 }}
          allowOverlap
          allowOverlapWithPuck
        >
          <MarkerCallout
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
  calloutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    paddingRight: 12,
    borderRadius: 12,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
  },
  placeholderThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  distance: {
    fontSize: 11,
    marginTop: 1,
  },
});
