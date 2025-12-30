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
    Dimensions,
    Image,
    Keyboard,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useTheme } from '../constants/theme';
import {
    filterLandmarks,
    getPreferredPhotoUrl,
    getSpotById,
    getSpotPhotos,
    normalizeImageUrl,
    searchSpots,
} from '../lib/api';
import { getCachedPhotos, setCachedPhotos } from '../lib/photoCache';
import type { Photo, Spot } from '../types/api';

type SheetMode = 'browse' | 'details' | 'search';
type LoadingState = 'idle' | 'loading' | 'error';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_GRID_GAP = 8;
const PHOTO_GRID_PADDING = 16;
const PHOTO_TILE_SIZE = (SCREEN_WIDTH - PHOTO_GRID_PADDING * 2 - PHOTO_GRID_GAP) / 2;

/**
 * Sort photos by "best" heuristic.
 * TODO: Replace with real "best photo" ranking from backend.
 * Current heuristic: higher resolution first, then newer createdAt.
 */
function sortPhotosByBest(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    // Prefer higher resolution
    const resA = (a.variants?.width || 0) * (a.variants?.height || 0);
    const resB = (b.variants?.width || 0) * (b.variants?.height || 0);
    if (resB !== resA) return resB - resA;
    
    // Then prefer newer photos
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
}

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

    // Load photos for details - landmark photos only (no hotspots)
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
        const landmarkPhotos = await getSpotPhotos(selectedSpotId);
        setPhotos(landmarkPhotos);
        setCachedPhotos(selectedSpotId, landmarkPhotos, 0);
        setPhotosLoading('idle');
      } catch (err) {
        console.error('Failed to load photos:', err);
        setPhotosLoading('error');
      }
    }, [selectedSpotId, photosLoading]);

    // Auto-load photos when entering details mode
    useEffect(() => {
      if (mode === 'details' && selectedSpotId && photosLoading === 'idle' && photos.length === 0) {
        handleLoadPhotos();
      }
    }, [mode, selectedSpotId, photosLoading, photos.length, handleLoadPhotos]);

    // Navigate to a specific photo's coordinates
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

    // Render details mode content - pure photo gallery
    const renderDetailsContent = () => (
      <BottomSheetScrollView contentContainerStyle={styles.detailsContent}>
        {/* Header with back button and title */}
        <View style={styles.detailsHeader}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.TEXT} />
          </Pressable>
          <Text style={[styles.detailsTitle, { color: theme.TEXT }]} numberOfLines={1}>
            {spot?.name || 'Photos'}
          </Text>
        </View>

        {/* Photo grid - the main content */}
        {photosLoading === 'loading' ? (
          // Skeleton tiles while loading
          <View style={styles.photoGrid}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View
                key={i}
                style={[styles.photoTileContainer, styles.photoTilePlaceholder, { backgroundColor: theme.BORDER }]}
              >
                <ActivityIndicator size="small" color={theme.TEXT_MUTED} />
              </View>
            ))}
          </View>
        ) : photosLoading === 'error' ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle" size={40} color={theme.TEXT_MUTED} />
            <Text style={[styles.emptyText, { color: theme.TEXT_MUTED }]}>
              Failed to load photos
            </Text>
            <Pressable
              style={[styles.retryButton, { backgroundColor: theme.ACCENT }]}
              onPress={handleLoadPhotos}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : photos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={48} color={theme.TEXT_MUTED} />
            <Text style={[styles.emptyText, { color: theme.TEXT_MUTED }]}>
              No photos available for this landmark
            </Text>
          </View>
        ) : (
          <>
            {/* 2-column vertical grid of photos */}
            <View style={styles.photoGrid}>
              {sortPhotosByBest(photos).map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  theme={theme}
                  onNavigate={() => handleNavigateToPhoto(photo)}
                  onOpenGallery={handleViewPhotos}
                />
              ))}
            </View>
            <Pressable style={styles.seeAllButton} onPress={handleViewPhotos}>
              <Text style={[styles.seeAllText, { color: theme.ACCENT }]}>
                Open full gallery {photos.length > 0 ? `(${photos.length} photos)` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.ACCENT} />
            </Pressable>
          </>
        )}
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

// Shared set to track which photo IDs have already logged errors (reduces noise)
const loggedPhotoErrors = new Set<string>();

// Photo tile component - simple version without URL fallbacks
function PhotoTile({
  photo,
  theme,
  onNavigate,
  onOpenGallery,
}: {
  photo: Photo;
  theme: ReturnType<typeof useTheme>;
  onNavigate: () => void;
  onOpenGallery: () => void;
}) {
  const imageUrl = useMemo(() => {
    const url = getPreferredPhotoUrl(photo.variants);
    return url ? normalizeImageUrl(url) : null;
  }, [photo.variants]);
  
  const [failed, setFailed] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const handleImageError = useCallback(() => {
    setFailed(true);
    // Log at most once per photo ID
    if (!loggedPhotoErrors.has(photo.id)) {
      loggedPhotoErrors.add(photo.id);
      console.warn(`[PhotoTile] Image failed for photo: ${photo.id}`);
    }
  }, [photo.id]);

  if (!imageUrl || failed) {
    return (
      <View style={[styles.photoTileContainer, styles.photoTilePlaceholder, { backgroundColor: theme.BORDER }]}>
        <Ionicons name="image-outline" size={24} color={theme.TEXT_MUTED} />
      </View>
    );
  }

  return (
    <Pressable
      style={styles.photoTileContainer}
      onPress={() => setShowActions(!showActions)}
    >
      <Image
        source={{ uri: imageUrl }}
        style={styles.photoTileImage}
        resizeMode="cover"
        onError={handleImageError}
      />
      {showActions && (
        <View style={styles.photoTileOverlay}>
          <Pressable
            style={[styles.photoTileAction, { backgroundColor: theme.ACCENT }]}
            onPress={onNavigate}
          >
            <Ionicons name="navigate" size={16} color="#FFF" />
            <Text style={styles.photoTileActionText}>Navigate here</Text>
          </Pressable>
          <Pressable
            style={[styles.photoTileAction, { backgroundColor: theme.CARD }]}
            onPress={onOpenGallery}
          >
            <Ionicons name="expand" size={16} color={theme.TEXT} />
            <Text style={[styles.photoTileActionText, { color: theme.TEXT }]}>Full gallery</Text>
          </Pressable>
        </View>
      )}
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
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PHOTO_GRID_GAP,
  },
  photoTileContainer: {
    width: PHOTO_TILE_SIZE,
    height: PHOTO_TILE_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoTileImage: {
    width: '100%',
    height: '100%',
  },
  photoTilePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoTileOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  photoTileAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    width: '100%',
  },
  photoTileActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
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
