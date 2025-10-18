import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

// Map access token (falls back to demo token for local/dev)
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.demo_token');

export default function TabOneScreen() {
  // centerCoordinate is [longitude, latitude]
  const [centerCoordinate, setCenterCoordinate] = useState<number[] | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          // fallback to Toronto if permission denied
          if (mounted) {
            Alert.alert(
              'Location permission',
              'Location permission was not granted. The map will fall back to Toronto.'
            );
            setCenterCoordinate([-79.3832, 43.6532]);
          }
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        if (mounted && loc?.coords) {
          setCenterCoordinate([loc.coords.longitude, loc.coords.latitude]);
        }
      } catch (err) {
        console.warn('Failed to get location', err);
        if (mounted) setCenterCoordinate([-79.3832, 43.6532]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera
          centerCoordinate={centerCoordinate ?? [-79.3832, 43.6532]}
          zoomLevel={13}
        />
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // ensure the MapView has an explicit width so native Mapbox
  // doesn't receive an invalid initial size (falls back to 64x64)
  map: { flex: 1, width: '100%' },
});
