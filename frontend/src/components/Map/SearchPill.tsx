import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { useTheme } from '../../constants/theme';

interface SearchPillProps {
  onPress: () => void;
}

export function SearchPill({ onPress }: SearchPillProps) {
  const theme = useTheme();
  
  return (
    <Pressable 
      style={[styles.container, { backgroundColor: theme.CARD }]} 
      onPress={onPress}
    >
      <Ionicons name="search" size={18} color={theme.TEXT_MUTED} />
      <Text style={[styles.text, { color: theme.TEXT_MUTED }]}>Search landmarks...</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    gap: 8,
  },
  text: {
    fontSize: 15,
    flex: 1,
  },
});
