import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
} from 'react-native';
import { THEME } from '../../constants/theme';

interface SearchPillProps {
  onPress: () => void;
}

export function SearchPill({ onPress }: SearchPillProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <Ionicons name="search" size={18} color={THEME.TEXT_MUTED} />
      <Text style={styles.text}>Search spots...</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.CARD,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  text: {
    fontSize: 15,
    color: THEME.TEXT_MUTED,
    flex: 1,
  },
});
