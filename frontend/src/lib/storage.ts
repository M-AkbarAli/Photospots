import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  HAS_FETCHED_ONCE: 'photospots_has_fetched_once',
  LAST_FETCHED_CENTER: 'photospots_last_fetched_center',
} as const;

export async function getHasFetchedOnce(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEYS.HAS_FETCHED_ONCE);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setHasFetchedOnce(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.HAS_FETCHED_ONCE, String(value));
  } catch (error) {
    console.warn('Failed to save hasFetchedOnce:', error);
  }
}

export async function getLastFetchedCenter(): Promise<[number, number] | null> {
  try {
    const value = await AsyncStorage.getItem(KEYS.LAST_FETCHED_CENTER);
    if (value) {
      return JSON.parse(value) as [number, number];
    }
    return null;
  } catch {
    return null;
  }
}

export async function setLastFetchedCenter(
  center: [number, number]
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.LAST_FETCHED_CENTER, JSON.stringify(center));
  } catch (error) {
    console.warn('Failed to save lastFetchedCenter:', error);
  }
}
