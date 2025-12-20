import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { THEME } from '../../constants/theme';

interface CategoryChipsProps {
  categories: string[];
  maxDisplay?: number;
}

export function CategoryChips({ categories, maxDisplay }: CategoryChipsProps) {
  const displayCategories = maxDisplay
    ? categories.slice(0, maxDisplay)
    : categories;
  const remaining = maxDisplay ? categories.length - maxDisplay : 0;

  if (categories.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {displayCategories.map((category, index) => (
        <View key={`${category}-${index}`} style={styles.chip}>
          <Text style={styles.chipText}>{category}</Text>
        </View>
      ))}
      {remaining > 0 && (
        <View style={[styles.chip, styles.moreChip]}>
          <Text style={styles.moreChipText}>+{remaining}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    backgroundColor: `${THEME.ACCENT}15`,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    color: THEME.ACCENT,
    fontWeight: '500',
  },
  moreChip: {
    backgroundColor: THEME.BORDER,
  },
  moreChipText: {
    fontSize: 12,
    color: THEME.TEXT_MUTED,
    fontWeight: '500',
  },
});
