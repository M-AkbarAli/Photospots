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
import { getSpotPhotos } from '../../lib/api';
import type { Photo } from '../../types/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function PhotoGalleryScreen() {
  const router = useRouter();
  const { spotId } = useLocalSearchParams<{ spotId: string }>();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!spotId) return;

    const loadPhotos = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSpotPhotos(spotId);
        setPhotos(data);
      } catch (err) {
        console.error('Failed to load photos:', err);
        setError('Failed to load photos');
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

    const url =
      Platform.OS === 'ios'
        ? `maps://app?daddr=${latitude},${longitude}`
        : `geo:${latitude},${longitude}?q=${latitude},${longitude}`;

    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
      );
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
    ({ item }: { item: Photo }) => (
      <View style={styles.photoContainer}>
        <Image
          source={{ uri: item.variants.url_l }}
          style={styles.photo}
          resizeMode="contain"
        />
      </View>
    ),
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
          <Ionicons name="arrow-back" size={24} color={THEME.TEXT} />
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
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={48} color={THEME.TEXT_MUTED} />
          <Text style={styles.emptyText}>No photos available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
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

      {/* Back button */}
      <Pressable style={styles.backButtonAbsolute} onPress={handleBack}>
        <View style={styles.iconBackground}>
          <Ionicons name="arrow-back" size={24} color={THEME.TEXT} />
        </View>
      </Pressable>

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
  backButtonAbsolute: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 10,
  },
  iconBackground: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
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
});
