import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { THEME } from '../../constants/theme';
import {
  aggregateHotspotPhotos,
  getPreferredPhotoUrl,
  getSpotById,
  getSpotHotspots,
  getSpotPhotos,
  normalizeImageUrl,
} from '../../lib/api';
import { getCachedPhotos, setCachedPhotos } from '../../lib/photoCache';
import type { Photo, Spot } from '../../types/api';
import { CategoryChips } from './CategoryChips';

interface SpotBottomSheetProps {
  spotId: string | null;
  initialSpot?: Spot | null;
  bottomSheetRef: React.RefObject<BottomSheetMethods | null>;
  onClose: () => void;
}

type LoadingState = 'idle' | 'loading' | 'error';

export function SpotBottomSheet({
  spotId,
  initialSpot,
  bottomSheetRef,
  onClose,
}: SpotBottomSheetProps) {
  const router = useRouter();
  const snapPoints = useMemo(() => ['18%', '55%', '92%'], []);

  const [spot, setSpot] = useState<Spot | null>(initialSpot || null);
  const [spotLoading, setSpotLoading] = useState<LoadingState>('idle');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState<LoadingState>('idle');
  const [photoErrors, setPhotoErrors] = useState(0);
  const [currentSnapIndex, setCurrentSnapIndex] = useState(0);

  // Load spot details when spotId changes
  useEffect(() => {
    if (!spotId) {
      setSpot(null);
      setPhotos([]);
      return;
    }

    const loadSpot = async () => {
      setSpotLoading('loading');
      try {
        const data = await getSpotById(spotId);

        // Some spot detail responses omit photoUrl; keep initialSpot's photoUrl as fallback.
        const merged: Spot = {
          ...(initialSpot || {}),
          ...data,
          photoUrl: data.photoUrl ?? initialSpot?.photoUrl,
        };

        setSpot(merged);
        setSpotLoading('idle');
      } catch (error) {
        console.error('Failed to load spot:', error);
        setSpotLoading('error');
      }
    };

    loadSpot();
  }, [spotId]);

  // Load photos from hotspots (aggregated gallery)
  const handleLoadPhotos = useCallback(async () => {
    if (!spotId || photosLoading === 'loading') return;

    // Check cache first
    const cached = getCachedPhotos(spotId);
    if (cached) {
      setPhotos(cached.photos);
      setPhotoErrors(cached.errors);
      setPhotosLoading('idle');
      return;
    }

    setPhotosLoading('loading');
    setPhotoErrors(0);

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

      setPhotosLoading('idle');
    } catch (error) {
      console.error('Failed to load photos:', error);
      // Try direct photos as final fallback
      try {
        const directPhotos = await getSpotPhotos(spotId);
        setPhotos(directPhotos);
        setCachedPhotos(spotId, directPhotos, 0);
        setPhotosLoading('idle');
      } catch {
        setPhotosLoading('error');
      }
    }
  }, [spotId, photosLoading]);

  const handleNavigate = useCallback(() => {
    if (!spot) return;

    const { latitude, longitude, name } = spot;
    const label = encodeURIComponent(name);
    const coordString = `${latitude},${longitude}`;

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
  }, [spot]);

  const handleViewPhotos = useCallback(() => {
    if (!spotId) return;
    router.push(`/photo-gallery/${spotId}`);
  }, [spotId, router]);

  const handleSheetChanges = useCallback((index: number) => {
    setCurrentSnapIndex(index);
    if (index === -1) {
      onClose();
    }
  }, [onClose]);

  const handleRetrySpot = useCallback(() => {
    if (spotId) {
      setSpotLoading('loading');
      getSpotById(spotId)
        .then((data) => {
          setSpot(data);
          setSpotLoading('idle');
        })
        .catch(() => {
          setSpotLoading('error');
        });
    }
  }, [spotId]);

  const formatDistance = (meters?: number) => {
    if (!meters) return null;
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  if (!spotId) return null;

  const headerMetaChildren = useMemo(() => {
    const items: React.ReactNode[] = [];

    if (spot?.distanceMeters) {
      items.push(
        <Text key="distance" style={styles.distance}>
          {formatDistance(spot.distanceMeters)}
        </Text>
      );
    }

    if (spot?.categories.length) {
      items.push(
        <CategoryChips
          key="categories"
          categories={spot.categories}
          maxDisplay={1}
        />
      );
    }

    return items;
  }, [spot]);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {spotLoading === 'loading' ? (
          <View style={styles.loadingContainer}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonSubtitle} />
            <View style={styles.skeletonImage} />
          </View>
        ) : spotLoading === 'error' ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={32} color={THEME.TEXT_MUTED} />
            <Text style={styles.errorText}>Failed to load spot details</Text>
            <Pressable style={styles.retryButton} onPress={handleRetrySpot}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : spot ? (
          <>
            {/* Collapsed view content */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title} numberOfLines={1}>
                  {spot.name}
                </Text>
                <View style={styles.headerMeta}>{headerMetaChildren}</View>
              </View>
              {normalizeImageUrl(spot.photoUrl) && currentSnapIndex === 0 ? (
                <Image
                  source={{ uri: normalizeImageUrl(spot.photoUrl)! }}
                  style={styles.thumbnailSmall}
                  onError={(e) => console.warn('[SpotBottomSheet] Thumbnail failed:', e.nativeEvent.error)}
                />
              ) : currentSnapIndex === 0 ? (
                <View style={[styles.thumbnailSmall, styles.placeholderImage]}>
                  <Ionicons name="image-outline" size={24} color={THEME.TEXT_MUTED} />
                </View>
              ) : null}
            </View>

            {/* Mid/Full view content */}
            {currentSnapIndex >= 1 && (
              <>
                {normalizeImageUrl(spot.photoUrl) ? (
                  <Image
                    source={{ uri: normalizeImageUrl(spot.photoUrl)! }}
                    style={styles.heroImage}
                    resizeMode="cover"
                    onError={(e) => console.warn('[SpotBottomSheet] Hero image failed:', e.nativeEvent.error)}
                  />
                ) : (
                  <View style={[styles.heroImage, styles.placeholderHero]}>
                    <Ionicons name="image-outline" size={48} color={THEME.TEXT_MUTED} />
                    <Text style={styles.placeholderText}>No photo available</Text>
                  </View>
                )}

                {spot.description && (
                  <Text
                    style={styles.description}
                    numberOfLines={currentSnapIndex === 1 ? 4 : undefined}
                  >
                    {spot.description}
                  </Text>
                )}

                {spot.categories.length > 0 && (
                  <View style={styles.categoriesContainer}>
                    <CategoryChips categories={spot.categories} />
                  </View>
                )}

                <View style={styles.buttonRow}>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleNavigate}
                  >
                    <Ionicons
                      name="navigate"
                      size={18}
                      color={THEME.CARD}
                    />
                    <Text style={styles.primaryButtonText}>Navigate</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={handleViewPhotos}
                  >
                    <Ionicons
                      name="images-outline"
                      size={18}
                      color={THEME.ACCENT}
                    />
                    <Text style={styles.secondaryButtonText}>View photos</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Full view - photo thumbnails */}
            {currentSnapIndex === 2 && (
              <View style={styles.photosSection}>
                <Text style={styles.sectionTitle}>Photos</Text>
                {photosLoading === 'idle' && photos.length === 0 ? (
                  <Pressable
                    style={styles.loadPhotosButton}
                    onPress={handleLoadPhotos}
                  >
                    <Text style={styles.loadPhotosText}>Load photos</Text>
                  </Pressable>
                ) : photosLoading === 'loading' ? (
                  <ActivityIndicator
                    size="small"
                    color={THEME.ACCENT}
                    style={styles.photosLoader}
                  />
                ) : photosLoading === 'error' ? (
                  <Pressable
                    style={styles.loadPhotosButton}
                    onPress={handleLoadPhotos}
                  >
                    <Text style={styles.loadPhotosText}>
                      Failed to load. Tap to retry
                    </Text>
                  </Pressable>
                ) : photos.length === 0 ? (
                  <View style={styles.noPhotosContainer}>
                    <Ionicons name="images-outline" size={32} color={THEME.TEXT_MUTED} />
                    <Text style={styles.noPhotosText}>No photos yet</Text>
                  </View>
                ) : (
                  <>
                    {photoErrors > 0 && (
                      <View style={styles.photoErrorBanner}>
                        <Text style={styles.photoErrorText}>
                          Some photos failed to load
                        </Text>
                        <Pressable onPress={handleLoadPhotos}>
                          <Text style={styles.photoRetryLink}>Retry</Text>
                        </Pressable>
                      </View>
                    )}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoThumbnails}
                    >
                      {photos.slice(0, 10).map((photo) => {
                        const imageUrl = getPreferredPhotoUrl(photo.variants);
                        if (!imageUrl) return null;
                        return (
                          <Image
                            key={photo.id}
                            source={{ uri: imageUrl }}
                            style={styles.photoThumbnail}
                            onError={(e) => console.warn('[SpotBottomSheet] Photo thumbnail failed:', photo.id, e.nativeEvent.error)}
                          />
                        );
                      })}
                    </ScrollView>
                    <Pressable
                      style={styles.seeAllButton}
                      onPress={handleViewPhotos}
                    >
                      <Text style={styles.seeAllText}>
                        See all photos {photos.length > 10 ? `(${photos.length})` : ''}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: THEME.CARD,
    borderRadius: 24,
  },
  handleIndicator: {
    backgroundColor: THEME.BORDER,
    width: 40,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    gap: 12,
  },
  skeletonTitle: {
    height: 24,
    width: '60%',
    backgroundColor: THEME.BORDER,
    borderRadius: 4,
  },
  skeletonSubtitle: {
    height: 16,
    width: '40%',
    backgroundColor: THEME.BORDER,
    borderRadius: 4,
  },
  skeletonImage: {
    height: 180,
    backgroundColor: THEME.BORDER,
    borderRadius: 12,
    marginTop: 8,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: THEME.TEXT_MUTED,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: THEME.ACCENT,
    borderRadius: 8,
  },
  retryButtonText: {
    color: THEME.CARD,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.TEXT,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  distance: {
    fontSize: 13,
    color: THEME.TEXT_MUTED,
  },
  thumbnailSmall: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  heroImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginTop: 16,
    backgroundColor: THEME.BORDER,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: THEME.TEXT,
    marginTop: 16,
  },
  categoriesContainer: {
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.ACCENT,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: THEME.CARD,
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${THEME.ACCENT}15`,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: THEME.ACCENT,
    fontWeight: '600',
    fontSize: 15,
  },
  photosSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.TEXT,
    marginBottom: 12,
  },
  loadPhotosButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadPhotosText: {
    color: THEME.ACCENT,
    fontSize: 14,
  },
  photosLoader: {
    paddingVertical: 12,
  },
  photoErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
  },
  photoErrorText: {
    fontSize: 12,
    color: '#92400E',
  },
  photoRetryLink: {
    fontSize: 12,
    color: THEME.ACCENT,
    fontWeight: '600',
  },
  photoThumbnails: {
    gap: 8,
  },
  photoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: THEME.BORDER,
  },
  seeAllButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  seeAllText: {
    color: THEME.ACCENT,
    fontSize: 14,
    fontWeight: '500',
  },
  placeholderImage: {
    backgroundColor: THEME.BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderHero: {
    backgroundColor: THEME.BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    color: THEME.TEXT_MUTED,
    fontSize: 14,
  },
  noPhotosContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  noPhotosText: {
    color: THEME.TEXT_MUTED,
    fontSize: 14,
  },
});
