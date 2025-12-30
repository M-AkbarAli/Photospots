import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { CategoryChips } from '../components/Spot/CategoryChips';
import { THEME } from '../constants/theme';
import { filterLandmarks, searchSpots } from '../lib/api';
import type { Spot } from '../types/api';

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const spots = await searchSpots(query.trim());
      // Filter to only show landmarks
      const landmarks = filterLandmarks(spots);
      setResults(landmarks);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleSelectSpot = useCallback(
    (spot: Spot) => {
      // Navigate back to map with spot data
      router.replace({
        pathname: '/',
        params: {
          selectedSpotId: spot.id,
          centerLng: String(spot.longitude),
          centerLat: String(spot.latitude),
        },
      });
    },
    [router]
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: Spot }) => (
      <Pressable
        style={styles.resultItem}
        onPress={() => handleSelectSpot(item)}
      >
        <View style={styles.resultContent}>
          <Text style={styles.resultName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.description && (
            <Text style={styles.resultDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          {item.categories.length > 0 && (
            <View style={styles.resultCategories}>
              <CategoryChips categories={item.categories} maxDisplay={2} />
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={THEME.TEXT_MUTED} />
      </Pressable>
    ),
    [handleSelectSpot]
  );

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    if (!hasSearched) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={48} color={THEME.BORDER} />
          <Text style={styles.emptyText}>Search for landmarks</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="location-outline" size={48} color={THEME.BORDER} />
        <Text style={styles.emptyText}>No landmarks found for "{query}"</Text>
      </View>
    );
  }, [loading, hasSearched, query]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={THEME.TEXT} />
        </Pressable>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={THEME.TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search landmarks..."
            placeholderTextColor={THEME.TEXT_MUTED}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={THEME.TEXT_MUTED} />
            </Pressable>
          )}
        </View>
        <Pressable style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.ACCENT} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.BORDER,
    backgroundColor: THEME.CARD,
  },
  backButton: {
    padding: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: THEME.TEXT,
  },
  searchButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchButtonText: {
    color: THEME.ACCENT,
    fontWeight: '600',
    fontSize: 15,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.CARD,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.BORDER,
  },
  resultContent: {
    flex: 1,
    marginRight: 8,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.TEXT,
  },
  resultDescription: {
    fontSize: 13,
    color: THEME.TEXT_MUTED,
    marginTop: 4,
  },
  resultCategories: {
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: THEME.TEXT_MUTED,
  },
});
