import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../constants/theme';
import {
  getPreferredPhotoUrl,
  getSpotPhotos,
  normalizeImageUrl,
} from '../../lib/api';
import { getCachedPhotos, setCachedPhotos } from '../../lib/photoCache';
import type { Photo } from '../../types/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 8;
const GRID_PADDING = 16;
const TILE_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

// Shared set to track logged errors (reduces noise)
const loggedPhotoErrors = new Set<string>();

/**
 * Sort photos by "best" heuristic.
 * TODO: Replace with real "best photo" ranking from backend.
 */
function sortPhotosByBest(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    const resA = (a.variants?.width || 0) * (a.variants?.height || 0);
    const resB = (b.variants?.width || 0) * (b.variants?.height || 0);
    if (resB !== resA) return resB - resA;
    
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
}

// Photo tile - simple version without URL fallbacks
function GalleryPhotoTile({
  photo,
  theme,
  onPress,
}: {
  photo: Photo;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
}) {
  const imageUrl = useMemo(() => {
    const url = getPreferredPhotoUrl(photo.variants);
    return url ? normalizeImageUrl(url) : null;
  }, [photo.variants]);
  
  const [failed, setFailed] = useState(false);

  const handleImageError = useCallback(() => {
    setFailed(true);
    if (!loggedPhotoErrors.has(photo.id)) {
      loggedPhotoErrors.add(photo.id);
      console.warn(`[GalleryPhotoTile] Image failed for photo: ${photo.id}`);
    }
  }, [photo.id]);

  if (!imageUrl || failed) {
    return (
      <View style={[styles.gridTile, styles.gridTilePlaceholder, { backgroundColor: theme.BORDER }]}>
        <Ionicons name="image-outline" size={32} color={theme.TEXT_MUTED} />
      </View>
    );
  }

  return (
    <Pressable style={styles.gridTile} onPress={onPress}>
      <Image
        source={{ uri: imageUrl }}
        style={styles.gridTileImage}
        resizeMode="cover"
        onError={handleImageError}
      />
    </Pressable>
  );
}

export default function PhotoGalleryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { spotId } = useLocalSearchParams<{ spotId: string }>();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal state for viewing a photo and navigating
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [modalImageFailed, setModalImageFailed] = useState(false);

  useEffect(() => {
    if (!spotId) return;

    const loadPhotos = async () => {
      setLoading(true);
      setError(null);

      // Check cache first
      const cached = getCachedPhotos(spotId);
      if (cached && cached.photos.length > 0) {
        setPhotos(cached.photos);
        setLoading(false);
        return;
      }

      try {
        // Load landmark photos only (no hotspot aggregation)
        const landmarkPhotos = await getSpotPhotos(spotId);
        setPhotos(landmarkPhotos);
        setCachedPhotos(spotId, landmarkPhotos, 0);
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

  const handleNavigateToPhoto = useCallback((photo: Photo) => {
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
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coordString}`);
        });
        return;
      }
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coordString}`);
    });
  }, []);

  const openPhotoModal = useCallback((photo: Photo) => {
    setSelectedPhoto(photo);
    setModalImageFailed(false);
  }, []);

  const closePhotoModal = useCallback(() => {
    setSelectedPhoto(null);
  }, []);

  const handleModalImageError = useCallback(() => {
    setModalImageFailed(true);
  }, []);

  // Get modal image URL
  const modalImageUrl = useMemo(() => {
    if (!selectedPhoto) return null;
    const url = getPreferredPhotoUrl(selectedPhoto.variants);
    return url ? normalizeImageUrl(url) : null;
  }, [selectedPhoto]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.BG }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.ACCENT} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.BG }]}>
        <Pressable style={styles.backButtonAbsolute} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={theme.TEXT} />
        </Pressable>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.TEXT_MUTED} />
          <Text style={[styles.errorText, { color: theme.TEXT }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.ACCENT }]}
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.BG }]}>
        <Pressable style={styles.backButtonAbsolute} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={theme.TEXT} />
        </Pressable>
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={48} color={theme.BORDER} />
          <Text style={[styles.emptyText, { color: theme.TEXT }]}>No photos available</Text>
          <Pressable style={[styles.emptyActionButton, { backgroundColor: theme.BORDER }]} onPress={handleBack}>
            <Text style={[styles.emptyActionText, { color: theme.TEXT }]}>Back to spots</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const sortedPhotos = sortPhotosByBest(photos);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.BG }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButtonInline} onPress={handleBack}>
          <View style={[styles.iconBackground, { backgroundColor: theme.CARD }]}>
            <Ionicons name="arrow-back" size={24} color={theme.ACCENT} />
          </View>
          <Text style={[styles.backButtonLabel, { color: theme.TEXT }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.TEXT }]}>
          {photos.length} photos
        </Text>
      </View>

      {/* Vertical 2-column grid */}
      <ScrollView
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {sortedPhotos.map((photo) => (
            <GalleryPhotoTile
              key={photo.id}
              photo={photo}
              theme={theme}
              onPress={() => openPhotoModal(photo)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Photo detail modal */}
      <Modal
        visible={selectedPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={closePhotoModal}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContent}>
            {/* Close button */}
            <Pressable style={styles.modalCloseButton} onPress={closePhotoModal}>
              <Ionicons name="close" size={32} color="#FFF" />
            </Pressable>

            {/* Image */}
            <View style={styles.modalImageContainer}>
              {modalImageFailed || !modalImageUrl ? (
                <View style={styles.modalPlaceholder}>
                  <Ionicons name="image-outline" size={64} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.modalPlaceholderText}>Image unavailable</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: modalImageUrl }}
                  style={styles.modalImage}
                  resizeMode="contain"
                  onError={handleModalImageError}
                />
              )}
            </View>

            {/* Navigate button */}
            {selectedPhoto && (
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.navigateButton, { backgroundColor: theme.ACCENT }]}
                  onPress={() => {
                    handleNavigateToPhoto(selectedPhoto);
                    closePhotoModal();
                  }}
                >
                  <Ionicons name="navigate" size={20} color="#FFF" />
                  <Text style={styles.navigateButtonText}>Navigate to this photo spot</Text>
                </Pressable>
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
  emptyActionButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionText: {
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  backButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonLabel: {
    fontWeight: '600',
    fontSize: 16,
  },
  iconBackground: {
    borderRadius: 24,
    padding: 10,
  },
  backButtonAbsolute: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  gridTileImage: {
    width: '100%',
    height: '100%',
  },
  gridTilePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  modalContent: {
    flex: 1,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 60,
    right: 16,
    zIndex: 10,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 24,
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  modalPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  modalPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
  },
  modalActions: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 16,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  navigateButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
