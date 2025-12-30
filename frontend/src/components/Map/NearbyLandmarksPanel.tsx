import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { THEME } from '../../constants/theme';
import { normalizeImageUrl } from '../../lib/api';
import type { Spot } from '../../types/api';

interface NearbyLandmarksPanelProps {
  landmarks: Spot[];
  loading: boolean;
  error: string | null;
  onSelectLandmark: (landmark: Spot) => void;
  onRetry: () => void;
}

function formatDistance(meters?: number): string {
  if (!meters) return '';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function LandmarkRow({
  landmark,
  onPress,
}: {
  landmark: Spot;
  onPress: () => void;
}) {
  const photoUrl = normalizeImageUrl(landmark.photoUrl);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.thumbnail}
          onError={() => {}}
        />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
          <Ionicons name="location" size={20} color={THEME.TEXT_MUTED} />
        </View>
      )}
      <View style={styles.rowContent}>
        <Text style={styles.rowName} numberOfLines={1}>
          {landmark.name}
        </Text>
        {landmark.distanceMeters !== undefined && (
          <Text style={styles.rowDistance}>
            {formatDistance(landmark.distanceMeters)}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={THEME.TEXT_MUTED} />
    </Pressable>
  );
}

function SkeletonRow() {
  return (
    <View style={styles.row}>
      <View style={[styles.thumbnail, styles.skeletonThumbnail]} />
      <View style={styles.rowContent}>
        <View style={styles.skeletonName} />
        <View style={styles.skeletonDistance} />
      </View>
    </View>
  );
}

export function NearbyLandmarksPanel({
  landmarks,
  loading,
  error,
  onSelectLandmark,
  onRetry,
}: NearbyLandmarksPanelProps) {
  const renderItem = ({ item }: { item: Spot }) => (
    <LandmarkRow landmark={item} onPress={() => onSelectLandmark(item)} />
  );

  const renderEmpty = () => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={32} color={THEME.TEXT_MUTED} />
          <Text style={styles.emptyText}>Couldn't load landmarks</Text>
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="location-outline" size={32} color={THEME.TEXT_MUTED} />
        <Text style={styles.emptyText}>No landmarks found in this area</Text>
        <Text style={styles.emptyHint}>Try "Search this area" to refresh</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.handle} />
        <Text style={styles.title}>Nearby landmarks</Text>
      </View>

      {loading ? (
        <View style={styles.listContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={landmarks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          style={styles.listContainer}
        />
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={THEME.ACCENT} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: THEME.CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.BORDER,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: THEME.BORDER,
    borderRadius: 2,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.TEXT,
  },
  listContainer: {
    maxHeight: 220,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.BORDER,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: THEME.BORDER,
  },
  placeholderThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonThumbnail: {
    backgroundColor: THEME.BORDER,
  },
  rowContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '500',
    color: THEME.TEXT,
  },
  rowDistance: {
    fontSize: 13,
    color: THEME.TEXT_MUTED,
    marginTop: 2,
  },
  skeletonName: {
    height: 16,
    width: '70%',
    backgroundColor: THEME.BORDER,
    borderRadius: 4,
  },
  skeletonDistance: {
    height: 12,
    width: '30%',
    backgroundColor: THEME.BORDER,
    borderRadius: 4,
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    color: THEME.TEXT_MUTED,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: THEME.TEXT_MUTED,
    textAlign: 'center',
    marginTop: 4,
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: THEME.ACCENT,
    borderRadius: 8,
  },
  retryButtonText: {
    color: THEME.CARD,
    fontWeight: '600',
    fontSize: 14,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 48,
    right: 16,
  },
});
