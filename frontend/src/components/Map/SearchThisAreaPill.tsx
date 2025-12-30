import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
} from 'react-native';
import { useTheme } from '../../constants/theme';

interface SearchThisAreaPillProps {
  onPress: () => void;
  isLoading: boolean;
}

export function SearchThisAreaPill({
  onPress,
  isLoading,
}: SearchThisAreaPillProps) {
  const theme = useTheme();
  
  return (
    <Pressable
      style={[styles.container, { backgroundColor: theme.ACCENT }, isLoading && styles.loading]}
      onPress={isLoading ? undefined : onPress}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <ActivityIndicator size="small" color="#FFF" />
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
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
    gap: 8,
  },
  loading: {
    opacity: 0.85,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
});
