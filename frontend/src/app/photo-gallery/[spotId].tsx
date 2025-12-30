import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Linking,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { THEME } from '../../constants/theme';
import {
    aggregateHotspotPhotos,
    getPreferredPhotoUrl,
    getSpotHotspots,
    getSpotPhotos,
    normalizeImageUrl,
} from '../../lib/api';
import { getCachedPhotos, setCachedPhotos } from '../../lib/photoCache';
import type { Photo } from '../../types/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function PhotoGalleryScreen() {
  const router = useRouter();
  const { spotId } = useLocalSearchParams<{ spotId: string }>();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [photoErrors, setPhotoErrors] = useState(0);

  useEffect(() => {
    if (!spotId) return;

    const loadPhotos = async () => {
      setLoading(true);
      setError(null);

      // Check cache first
      const cached = getCachedPhotos(spotId);
      if (cached && cached.photos.length > 0) {
        setPhotos(cached.photos);
        setPhotoErrors(cached.errors);
        setLoading(false);
        return;
      }

      try {
        // Strategy: fetch hotspots, then aggregate their photos
        const hotspots = await getSpotHotspots(spotId);

        if (hotspots.length > 0) {
          const { photos: aggregatedPhotos, errors } = await aggregateHotspotPhotos(
            hotspots,
            { maxHotspots: 20, maxPhotos: 60, concurrency: 4 }
          );
          setPhotos(aggregatedPhotos);
          setPhotoErrors(errors);
          setCachedPhotos(spotId, aggregatedPhotos, errors);
        } else {
          // Fallback: get photos directly from the landmark
          const directPhotos = await getSpotPhotos(spotId);
          setPhotos(directPhotos);
          setCachedPhotos(spotId, directPhotos, 0);
        }
      } catch (err) {
        console.error('Failed to load photos:', err);
        // Try direct photos as final fallback
        try {
          const directPhotos = await getSpotPhotos(spotId);
          setPhotos(directPhotos);
          setCachedPhotos(spotId, directPhotos, 0);
        } catch {
          setError('Failed to load photos');
        }
      } finally {
        setLoading(false);
      }
    };

    loadPhotos();
  }, [spotId]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleNavigateToPhoto = useCallback(() => {
    const photo = photos[currentIndex];
    if (!photo) return;

    const { latitude, longitude } = photo.variants;
    const coordString = `${latitude},${longitude}`;
    const label = encodeURIComponent('Photo location');

    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${coordString}&ll=${coordString}&q=${label}`
        : `google.navigation:q=${coordString}`;

    Linking.openURL(url).catch(() => {
      if (Platform.OS === 'android') {
        Linking.openURL(`geo:${coordString}?q=${coordString}(${label})`).catch(() => {
          Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&destination=${coordString}`
          );
        });
        return;
      }

      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coordString}`);
    });
  }, [photos, currentIndex]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const renderPhoto = useCallback(
    ({ item }: { item: Photo }) => {
      const imageUrl = getPreferredPhotoUrl(item.variants) || normalizeImageUrl(item.variants?.url_l);

      if (!imageUrl) {
        return (
          <View style={styles.photoContainer}>
            <View style={styles.photoPlaceholder}>
              <Ionicons name="image-outline" size={48} color={THEME.TEXT_MUTED} />
              <Text style={styles.photoPlaceholderText}>Image unavailable</Text>
            </View>
          </View>
        );
      }

      return (
        <View style={styles.photoContainer}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.photo}
            resizeMode="contain"
            onError={(e) => console.warn('[PhotoGallery] Image failed:', item.id, e.nativeEvent.error)}
          />
        </View>
      );
    },
    []
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.ACCENT} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.backButtonAbsolute} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={THEME.CARD} />
        </Pressable>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={THEME.TEXT_MUTED} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              setError(null);
              if (spotId) {
                getSpotPhotos(spotId)
                  .then(setPhotos)
                  .catch(() => setError('Failed to load photos'))
                  .finally(() => setLoading(false));
              }
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (photos.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.backButtonAbsolute} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={THEME.TEXT} />
        </Pressable>
        <View style={[styles.emptyContainer, styles.emptyFullHeight]}>
          <Ionicons name="images-outline" size={48} color={THEME.CARD} />
          <Text style={styles.emptyText}>No photos available</Text>
          <Pressable style={styles.emptyActionButton} onPress={handleBack}>
            <Text style={styles.emptyActionText}>Back to spots</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
        <SafeAreaView style={styles.headerBar}>
          <Pressable style={styles.backButtonInline} onPress={handleBack}>
            <View style={styles.iconBackground}>
              <Ionicons name="arrow-back" size={20} color={THEME.ACCENT} />
            </View>
            <Text style={styles.backButtonLabel}>Back</Text>
          </Pressable>
        </SafeAreaView>

        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          renderItem={renderPhoto}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
        />

        {/* Photo counter */}
        <View style={styles.counterContainer}>
          <Text style={styles.counterText}>
            {currentIndex + 1} / {photos.length}
          </Text>
        </View>

        {/* Navigate button */}
        <View style={styles.bottomOverlay}>
          <Pressable style={styles.navigateButton} onPress={handleNavigateToPhoto}>
            <Ionicons name="navigate" size={20} color={THEME.CARD} />
            <Text style={styles.navigateButtonText}>Navigate to this photo spot</Text>
          </Pressable>
        </View>
      </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.TEXT,
    paddingTop: 64,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.TEXT,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    color: THEME.CARD,
    fontSize: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: THEME.ACCENT,
    borderRadius: 8,
  },
  retryButtonText: {
    color: THEME.CARD,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: THEME.CARD,
    fontSize: 16,
  },
  emptyFullHeight: {
    flex: 1,
    justifyContent: 'center',
  },
  photoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  photoPlaceholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  photoPlaceholderText: {
    color: THEME.TEXT_MUTED,
    fontSize: 16,
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  backButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonLabel: {
    color: THEME.CARD,
    fontWeight: '600',
    fontSize: 16,
  },
  iconBackground: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
  },
  backButtonAbsolute: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  counterText: {
    color: THEME.CARD,
    fontSize: 14,
    fontWeight: '500',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  navigateButtonText: {
    color: THEME.CARD,
    fontWeight: '600',
    fontSize: 16,
  },
  emptyActionButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyActionText: {
    color: THEME.CARD,
    fontWeight: '600',
  },
});
