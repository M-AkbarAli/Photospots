import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// iOS-style dark translucent search bar colors (hardcoded for pixel-perfect match)
const SEARCH_BAR_BG = 'rgba(44, 44, 46, 0.88)';
const SEARCH_BAR_BORDER = 'rgba(255, 255, 255, 0.10)';
const SEARCH_BAR_PLACEHOLDER = 'rgba(235, 235, 245, 0.60)';
const SEARCH_BAR_REFRESH_BLUE = '#0A84FF';

interface SearchPillProps {
  onPress: () => void;
  onRefresh?: () => void;
}

export function SearchPill({ onPress, onRefresh }: SearchPillProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <Ionicons name="search" size={18} color={SEARCH_BAR_PLACEHOLDER} />
      <Text style={styles.text}>Search landmarks...</Text>
      <Pressable
        style={styles.refreshButton}
        onPress={(e) => {
          e.stopPropagation();
          onRefresh?.();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.refreshIconContainer}>
          <Ionicons name="refresh" size={16} color={SEARCH_BAR_REFRESH_BLUE} />
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    backgroundColor: SEARCH_BAR_BG,
    borderWidth: 1,
    borderColor: SEARCH_BAR_BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
    gap: 10,
  },
  text: {
    fontSize: 16,
    flex: 1,
    color: SEARCH_BAR_PLACEHOLDER,
  },
  refreshButton: {
    padding: 4,
  },
  refreshIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
