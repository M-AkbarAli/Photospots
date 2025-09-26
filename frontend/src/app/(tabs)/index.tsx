import Mapbox from '@rnmapbox/maps';
import React from 'react';
import { StyleSheet, View } from 'react-native';

// Minimal Mapbox screen: no location, just a static map centered on Toronto.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.demo_token');

export default function TabOneScreen() {
  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera
          centerCoordinate={[-79.3832, 43.6532]} // Toronto (lon, lat)
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
