import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

// Set your Mapbox access token
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.demo_token');

export default function TabOneScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert(
          'Location Permission Required',
          'This app needs location access to show you nearby photogenic spots.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Location.enableNetworkProviderAsync() }
          ]
        );
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        zoomEnabled={true}
        scrollEnabled={true}
        pitchEnabled={true}
        rotateEnabled={true}
      >
        <Mapbox.Camera
          zoomLevel={14}
          centerCoordinate={
            location 
              ? [location.coords.longitude, location.coords.latitude]
              : [-122.4194, 37.7749] // Default to SF if no location
          }
          animationMode="flyTo"
          animationDuration={2000}
        />
        
        {location && (
          <Mapbox.PointAnnotation
            id="userLocation"
            coordinate={[location.coords.longitude, location.coords.latitude]}
          >
            <View style={styles.userLocationMarker} />
          </Mapbox.PointAnnotation>
        )}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  userLocationMarker: {
    width: 20,
    height: 20,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
});
