import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
} from 'react-native';
import { THEME } from '../../constants/theme';

interface SearchThisAreaPillProps {
  onPress: () => void;
  isLoading: boolean;
}

export function SearchThisAreaPill({
  onPress,
  isLoading,
}: SearchThisAreaPillProps) {
  return (
    <Pressable
      style={[styles.container, isLoading && styles.loading]}
      onPress={isLoading ? undefined : onPress}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <ActivityIndicator size="small" color={THEME.CARD} />
          <Text style={styles.text}>Searching…</Text>
        </>
      ) : (
        <Text style={styles.text}>Search this area</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.ACCENT,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: 8,
  },
  loading: {
    opacity: 0.85,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.CARD,
  },
});
