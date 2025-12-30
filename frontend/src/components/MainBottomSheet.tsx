import { Ionicons } from '@expo/vector-icons';
import BottomSheet, {
    BottomSheetFlatList,
    BottomSheetScrollView,
    BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Image,
    Keyboard,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useTheme } from '../constants/theme';
import {
    aggregateHotspotPhotos,
    filterLandmarks,
    getPreferredPhotoUrl,
    getSpotById,
    getSpotHotspots,
    getSpotPhotos,
    normalizeImageUrl,
    searchSpots,
} from '../lib/api';
import { getCachedPhotos, setCachedPhotos } from '../lib/photoCache';
import type { Photo, Spot } from '../types/api';

type SheetMode = 'browse' | 'details' | 'search';
type LoadingState = 'idle' | 'loading' | 'error';

interface MainBottomSheetProps {
  landmarks: Spot[];
  selectedSpotId: string | null;
  initialSpot?: Spot | null;
  loading: boolean;
  error: string | null;
  onSelectLandmark: (landmark: Spot) => void;
  onClose: () => void;
  onRetry: () => void;
}

export interface MainBottomSheetRef {
  snapToIndex: (index: number) => void;
  close: () => void;
  setMode: (mode: SheetMode) => void;
}

function formatDistance(meters?: number): string {
  if (!meters) return '';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export const MainBottomSheet = forwardRef<MainBottomSheetRef, MainBottomSheetProps>(
  (
    {
      landmarks,
      selectedSpotId,
      initialSpot,
      loading,
      error,
      onSelectLandmark,
      onClose,
      onRetry,
    },
    ref
  ) => {
    const theme = useTheme();
    const router = useRouter();
    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['20%', '55%', '94%'], []);

    const [mode, setMode] = useState<SheetMode>(selectedSpotId ? 'details' : 'browse');
    const [currentSnapIndex, setCurrentSnapIndex] = useState(0);

    // Details mode state
    const [spot, setSpot] = useState<Spot | null>(initialSpot || null);
    const [spotLoading, setSpotLoading] = useState<LoadingState>('idle');
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [photosLoading, setPhotosLoading] = useState<LoadingState>('idle');
    const [photoErrors, setPhotoErrors] = useState(0);

    // Search mode state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Spot[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    useImperativeHandle(ref, () => ({
      snapToIndex: (index: number) => bottomSheetRef.current?.snapToIndex(index),
      close: () => bottomSheetRef.current?.close(),
      setMode: (newMode: SheetMode) => setMode(newMode),
    }));

    // Switch mode when selectedSpotId changes
    useEffect(() => {
      if (selectedSpotId) {
        setMode('details');
        setSpot(initialSpot || null);
        setPhotos([]);
        setPhotosLoading('idle');
      } else {
        setMode('browse');
        setSearchQuery('');
        setSearchResults([]);
        setHasSearched(false);
      }
    }, [selectedSpotId, initialSpot]);

    // Load spot details
    useEffect(() => {
      if (!selectedSpotId || mode !== 'details') return;

      const loadSpot = async () => {
        setSpotLoading('loading');
        try {
          const data = await getSpotById(selectedSpotId);
          const merged: Spot = {
            ...(initialSpot || {}),
            ...data,
            photoUrl: data.photoUrl ?? initialSpot?.photoUrl,
          };
          setSpot(merged);
          setSpotLoading('idle');
        } catch (err) {
          console.error('Failed to load spot:', err);
          setSpotLoading('error');
        }
      };

      loadSpot();
    }, [selectedSpotId, mode, initialSpot]);

    // Load photos for details
    const handleLoadPhotos = useCallback(async () => {
      if (!selectedSpotId || photosLoading === 'loading') return;

      const cached = getCachedPhotos(selectedSpotId);
      if (cached) {
        setPhotos(cached.photos);
        setPhotoErrors(cached.errors);
        return;
      }

      setPhotosLoading('loading');
      setPhotoErrors(0);

      try {
        const hotspots = await getSpotHotspots(selectedSpotId);
        if (hotspots.length > 0) {
          const { photos: aggregatedPhotos, errors } = await aggregateHotspotPhotos(
            hotspots,
            { maxHotspots: 20, maxPhotos: 60, concurrency: 4 }
          );
          setPhotos(aggregatedPhotos);
          setPhotoErrors(errors);
          setCachedPhotos(selectedSpotId, aggregatedPhotos, errors);
        } else {
          const directPhotos = await getSpotPhotos(selectedSpotId);
          setPhotos(directPhotos);
          setCachedPhotos(selectedSpotId, directPhotos, 0);
        }
        setPhotosLoading('idle');
      } catch (err) {
        console.error('Failed to load photos:', err);
        try {
          const directPhotos = await getSpotPhotos(selectedSpotId);
          setPhotos(directPhotos);
          setCachedPhotos(selectedSpotId, directPhotos, 0);
          setPhotosLoading('idle');
        } catch {
          setPhotosLoading('error');
        }
      }
    }, [selectedSpotId, photosLoading]);

    // Navigate to landmark
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
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coordString}`);
      });
    }, [spot]);

    // View all photos
    const handleViewPhotos = useCallback(() => {
      if (!selectedSpotId) return;
      router.push(`/photo-gallery/${selectedSpotId}`);
    }, [selectedSpotId, router]);

    // Handle search
    const handleSearch = useCallback(async () => {
      if (!searchQuery.trim()) return;
      Keyboard.dismiss();
      setSearchLoading(true);
      setHasSearched(true);

      try {
        const spots = await searchSpots(searchQuery.trim());
        const filtered = filterLandmarks(spots);
        setSearchResults(filtered);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, [searchQuery]);

    // Handle search input focus
    const handleSearchFocus = useCallback(() => {
      setMode('search');
      bottomSheetRef.current?.snapToIndex(2);
    }, []);

    // Handle back from details/search
    const handleBack = useCallback(() => {
      if (mode === 'search') {
        setMode('browse');
        setSearchQuery('');
        setSearchResults([]);
        setHasSearched(false);
        bottomSheetRef.current?.snapToIndex(0);
      } else {
        onClose();
      }
    }, [mode, onClose]);

    // Handle sheet changes
    const handleSheetChanges = useCallback(
      (index: number) => {
        setCurrentSnapIndex(index);
        if (index === -1) {
          onClose();
        }
      },
      [onClose]
    );

    // Handle search result select
    const handleSearchResultSelect = useCallback(
      (result: Spot) => {
        setSearchQuery('');
        setSearchResults([]);
        setHasSearched(false);
        onSelectLandmark(result);
      },
      [onSelectLandmark]
    );

    // Render browse mode content
    const renderBrowseContent = () => (
      <>
        {/* Search input - iOS dark translucent style matching top search bar */}
        <Pressable
          style={styles.browseSearchBar}
          onPress={handleSearchFocus}
        >
          <Ionicons name="search" size={18} color="rgba(235, 235, 245, 0.60)" />
          <Text style={styles.browseSearchPlaceholder}>
            Search landmarks...
          </Text>
          <Pressable
            style={styles.browseRefreshButton}
            onPress={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.browseRefreshIconContainer}>
              <Ionicons name="refresh" size={14} color="#0A84FF" />
            </View>
          </Pressable>
        </Pressable>

        <Text style={[styles.sectionTitle, { color: theme.TEXT }]}>Nearby landmarks</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={[styles.skeletonRow, { backgroundColor: theme.BORDER }]}>
                <View style={[styles.skeletonThumbnail, { backgroundColor: theme.BG }]} />
                <View style={styles.skeletonText}>
                  <View style={[styles.skeletonLine, { backgroundColor: theme.BG, width: '70%' }]} />
                  <View style={[styles.skeletonLine, { backgroundColor: theme.BG, width: '40%' }]} />
                </View>
              </View>
            ))}
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={theme.TEXT_MUTED} />
            <Text style={[styles.emptyText, { color: theme.TEXT_MUTED }]}>
              Couldn't load landmarks
            </Text>
            <Pressable
              style={[styles.retryButton, { backgroundColor: theme.ACCENT }]}
              onPress={onRetry}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : landmarks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={40} color={theme.TEXT_MUTED} />
            <Text style={[styles.emptyText, { color: theme.TEXT_MUTED }]}>
              No landmarks found nearby
            </Text>
            <Text style={[styles.emptyHint, { color: theme.TEXT_SECONDARY }]}>
              Try "Search this area" to refresh
            </Text>
          </View>
        ) : (
          <BottomSheetFlatList<Spot>
            data={landmarks}
            keyExtractor={(item: Spot) => item.id}
            renderItem={({ item }: { item: Spot }) => (
              <LandmarkRow
                landmark={item}
                theme={theme}
                onPress={() => onSelectLandmark(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </>
    );

    // Render search mode content
    const renderSearchContent = () => (
      <>
        <View style={styles.searchHeader}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.TEXT} />
          </Pressable>
          <View style={[styles.searchInputContainerActive, { backgroundColor: theme.BORDER }]}>
            <Ionicons name="search" size={18} color={theme.TEXT_MUTED} />
            <BottomSheetTextInput
              style={[styles.searchInput, { color: theme.TEXT }]}
              placeholder="Search landmarks..."
              placeholderTextColor={theme.TEXT_MUTED}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoFocus
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.TEXT_MUTED} />
              </Pressable>
            )}
          </View>
        </View>

        {searchLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.ACCENT} />
          </View>
        ) : !hasSearched ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search" size={48} color={theme.BORDER} />
            <Text style={[styles.emptyText, { color: theme.TEXT_MUTED }]}>
              Search for landmarks
            </Text>
          </View>
        ) : searchResults.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={48} color={theme.BORDER} />
            <Text style={[styles.emptyText, { color: theme.TEXT_MUTED }]}>
              No landmarks found for "{searchQuery}"
            </Text>
          </View>
        ) : (
          <BottomSheetFlatList<Spot>
            data={searchResults}
            keyExtractor={(item: Spot) => item.id}
            renderItem={({ item }: { item: Spot }) => (
              <LandmarkRow
                landmark={item}
                theme={theme}
                onPress={() => handleSearchResultSelect(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
          />
        )}
      </>
    );

    // Render details mode content
    const renderDetailsContent = () => (
      <BottomSheetScrollView contentContainerStyle={styles.detailsContent}>
        {/* Header with back button */}
        <View style={styles.detailsHeader}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.TEXT} />
          </Pressable>
          <Text style={[styles.detailsTitle, { color: theme.TEXT }]} numberOfLines={1}>
            {spot?.name || 'Loading...'}
          </Text>
        </View>

        {spotLoading === 'loading' ? (
          <View style={styles.loadingContainer}>
            <View style={[styles.skeletonHero, { backgroundColor: theme.BORDER }]} />
            <View style={[styles.skeletonLine, { backgroundColor: theme.BORDER, width: '60%', marginTop: 16 }]} />
            <View style={[styles.skeletonLine, { backgroundColor: theme.BORDER, width: '40%', marginTop: 8 }]} />
          </View>
        ) : spotLoading === 'error' ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle" size={40} color={theme.TEXT_MUTED} />
            <Text style={[styles.emptyText, { color: theme.TEXT_MUTED }]}>
              Failed to load details
            </Text>
            <Pressable
              style={[styles.retryButton, { backgroundColor: theme.ACCENT }]}
              onPress={() => {
                if (selectedSpotId) {
                  setSpotLoading('loading');
                  getSpotById(selectedSpotId)
                    .then((data: Spot) => {
                      setSpot(data);
                      setSpotLoading('idle');
                    })
                    .catch(() => setSpotLoading('error'));
                }
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : spot ? (
          <>
            {/* Hero image */}
            {normalizeImageUrl(spot.photoUrl) ? (
              <Image
                source={{ uri: normalizeImageUrl(spot.photoUrl)! }}
                style={styles.heroImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder, { backgroundColor: theme.BORDER }]}>
                <Ionicons name="image-outline" size={48} color={theme.TEXT_MUTED} />
              </View>
            )}

            {/* Info section */}
            <View style={styles.infoSection}>
              {spot.distanceMeters !== undefined && (
                <Text style={[styles.distance, { color: theme.TEXT_MUTED }]}>
                  {formatDistance(spot.distanceMeters)} away
                </Text>
              )}
              {spot.description && (
                <Text
                  style={[styles.description, { color: theme.TEXT }]}
                  numberOfLines={currentSnapIndex < 2 ? 3 : undefined}
                >
                  {spot.description}
                </Text>
              )}
            </View>

            {/* Navigate button */}
            <Pressable
              style={[styles.navigateButton, { backgroundColor: theme.ACCENT }]}
              onPress={handleNavigate}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.navigateButtonText}>Navigate to landmark</Text>
            </Pressable>

            {/* Photos section */}
            <View style={styles.photosSection}>
              <Text style={[styles.sectionTitle, { color: theme.TEXT }]}>Photos</Text>

              {photosLoading === 'idle' && photos.length === 0 ? (
                <Pressable
                  style={[styles.loadPhotosButton, { backgroundColor: theme.BORDER }]}
                  onPress={handleLoadPhotos}
                >
                  <Ionicons name="images-outline" size={20} color={theme.ACCENT} />
                  <Text style={[styles.loadPhotosText, { color: theme.ACCENT }]}>
                    Load photos
                  </Text>
                </Pressable>
              ) : photosLoading === 'loading' ? (
                <ActivityIndicator size="small" color={theme.ACCENT} style={styles.photosLoader} />
              ) : photosLoading === 'error' ? (
                <Pressable style={styles.loadPhotosButton} onPress={handleLoadPhotos}>
                  <Text style={[styles.loadPhotosText, { color: theme.ACCENT }]}>
                    Failed to load. Tap to retry
                  </Text>
                </Pressable>
              ) : photos.length === 0 ? (
                <View style={styles.noPhotosContainer}>
                  <Ionicons name="images-outline" size={32} color={theme.TEXT_MUTED} />
                  <Text style={[styles.noPhotosText, { color: theme.TEXT_MUTED }]}>
                    No photos available
                  </Text>
                </View>
              ) : (
                <>
                  {photoErrors > 0 && (
                    <View style={[styles.photoErrorBanner, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                      <Text style={styles.photoErrorText}>Some photos failed to load</Text>
                      <Pressable onPress={handleLoadPhotos}>
                        <Text style={[styles.photoRetryLink, { color: theme.ACCENT }]}>Retry</Text>
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
                        <Pressable key={photo.id} onPress={handleViewPhotos}>
                          <Image source={{ uri: imageUrl }} style={styles.photoThumbnail} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Pressable style={styles.seeAllButton} onPress={handleViewPhotos}>
                    <Text style={[styles.seeAllText, { color: theme.ACCENT }]}>
                      See all photos {photos.length > 10 ? `(${photos.length})` : ''}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.ACCENT} />
                  </Pressable>
                </>
              )}
            </View>
          </>
        ) : null}
      </BottomSheetScrollView>
    );

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        enablePanDownToClose={mode === 'details'}
        backgroundStyle={[styles.sheetBackground, { backgroundColor: theme.CARD }]}
        handleIndicatorStyle={[styles.handleIndicator, { backgroundColor: theme.BORDER }]}
      >
        <View style={styles.content}>
          {mode === 'browse' && renderBrowseContent()}
          {mode === 'search' && renderSearchContent()}
          {mode === 'details' && renderDetailsContent()}
        </View>
      </BottomSheet>
    );
  }
);

// Landmark row component
function LandmarkRow({
  landmark,
  theme,
  onPress,
}: {
  landmark: Spot;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
}) {
  const photoUrl = normalizeImageUrl(landmark.photoUrl);

  return (
    <Pressable
      style={[styles.landmarkRow, { borderBottomColor: theme.BORDER }]}
      onPress={onPress}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.rowThumbnail} />
      ) : (
        <View style={[styles.rowThumbnail, styles.placeholderThumbnail, { backgroundColor: theme.BORDER }]}>
          <Ionicons name="location" size={20} color={theme.TEXT_MUTED} />
        </View>
      )}
      <View style={styles.rowContent}>
        <Text style={[styles.rowName, { color: theme.TEXT }]} numberOfLines={1}>
          {landmark.name}
        </Text>
        {landmark.distanceMeters !== undefined && (
          <Text style={[styles.rowDistance, { color: theme.TEXT_MUTED }]}>
            {formatDistance(landmark.distanceMeters)}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.TEXT_MUTED} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    borderRadius: 24,
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 15,
  },
  // iOS dark translucent search bar (matching top SearchPill)
  browseSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(44, 44, 46, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    gap: 10,
  },
  browseSearchPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: 'rgba(235, 235, 245, 0.60)',
  },
  browseRefreshButton: {
    padding: 2,
  },
  browseRefreshIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  searchInputContainerActive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 16,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  skeletonThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  skeletonText: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
  },
  skeletonHero: {
    width: '100%',
    height: 180,
    borderRadius: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 40,
  },
  landmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  placeholderThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowDistance: {
    fontSize: 13,
    marginTop: 3,
  },
  detailsContent: {
    paddingBottom: 40,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  detailsTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  heroImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
  },
  heroPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    marginTop: 16,
  },
  distance: {
    fontSize: 14,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  navigateButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  photosSection: {
    marginTop: 28,
  },
  loadPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  loadPhotosText: {
    fontSize: 15,
    fontWeight: '500',
  },
  photosLoader: {
    paddingVertical: 16,
  },
  noPhotosContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  noPhotosText: {
    fontSize: 14,
  },
  photoErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  photoErrorText: {
    fontSize: 12,
    color: '#92400E',
  },
  photoRetryLink: {
    fontSize: 12,
    fontWeight: '600',
  },
  photoThumbnails: {
    gap: 10,
  },
  photoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 10,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 4,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
