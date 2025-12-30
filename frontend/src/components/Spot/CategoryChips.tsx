import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../constants/theme';

interface CategoryChipsProps {
  categories: string[];
  maxDisplay?: number;
}

export function CategoryChips({ categories, maxDisplay }: CategoryChipsProps) {
  const theme = useTheme();
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
        <View key={`${category}-${index}`} style={[styles.chip, { backgroundColor: `${theme.ACCENT}20` }]}>
          <Text style={[styles.chipText, { color: theme.ACCENT }]}>{category}</Text>
        </View>
      ))}
      {remaining > 0 && (
        <View style={[styles.chip, { backgroundColor: theme.BORDER }]}>
          <Text style={[styles.moreChipText, { color: theme.TEXT_MUTED }]}>+{remaining}</Text>
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
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  moreChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
