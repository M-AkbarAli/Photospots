import Mapbox from '@rnmapbox/maps';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import type { Spot } from '../../types/api';

// Red pin image asset
const pinRedImage = require('../../../assets/images/pin-red.png');

interface SpotLayersProps {
  spots: Spot[];
  selectedSpotId: string | null;
  onSpotSelect: (spotId: string) => void;
  onClusterTap?: (coordinates: [number, number], expansionZoom: number) => void;
}

export interface SpotLayersRef {
  getClusterExpansionZoom: (feature: any) => Promise<number>;
}

function spotsToGeoJSON(spots: Spot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((spot) => ({
      type: 'Feature',
      id: spot.id,
      properties: {
        spotId: spot.id,
        name: spot.name,
        score: spot.score,
      },
      geometry: {
        type: 'Point',
        coordinates: [spot.longitude, spot.latitude],
      },
    })),
  };
}

export const SpotLayers = forwardRef<SpotLayersRef, SpotLayersProps>(
  ({ spots, selectedSpotId, onSpotSelect }, ref) => {
    const shapeSourceRef = useRef<Mapbox.ShapeSource>(null);

    useImperativeHandle(ref, () => ({
      getClusterExpansionZoom: async () => {
        // Clustering is disabled, return default zoom
        return 14;
      },
    }));

    const handlePress = useCallback(
      async (e: any) => {
        const feature = e?.features?.[0];
        if (!feature) return;

        const spotId = feature.properties?.spotId;
        if (spotId) {
          onSpotSelect(spotId);
        }
      },
      [onSpotSelect]
    );

    const featureCollection = spotsToGeoJSON(spots);

    return (
      <>
        {/* Register the red pin image for use in SymbolLayer */}
        <Mapbox.Images images={{ 'pin-red': pinRedImage }} />

        <Mapbox.ShapeSource
          id="spots"
          ref={shapeSourceRef}
          shape={featureCollection}
          cluster={false}
          onPress={handlePress}
        >
          {/* Red pin markers for all spots */}
          <Mapbox.SymbolLayer
            id="spot-pins"
            style={{
              iconImage: 'pin-red',
              iconSize: [
                'case',
                ['==', ['get', 'spotId'], selectedSpotId || ''],
                0.7,
                0.5,
              ],
              iconAnchor: 'bottom',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />
        </Mapbox.ShapeSource>
      </>
    );
  }
);
