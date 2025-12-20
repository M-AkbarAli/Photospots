import Mapbox from '@rnmapbox/maps';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { THEME } from '../../constants/theme';
import type { Spot } from '../../types/api';

interface SpotLayersProps {
  spots: Spot[];
  selectedSpotId: string | null;
  onSpotSelect: (spotId: string) => void;
  onClusterTap: (coordinates: [number, number], expansionZoom: number) => void;
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
  ({ spots, selectedSpotId, onSpotSelect, onClusterTap }, ref) => {
    const shapeSourceRef = useRef<Mapbox.ShapeSource>(null);

    useImperativeHandle(ref, () => ({
      getClusterExpansionZoom: async (feature: any) => {
        if (shapeSourceRef.current) {
          return await shapeSourceRef.current.getClusterExpansionZoom(feature);
        }
        return 14;
      },
    }));

    const handlePress = useCallback(
      async (e: any) => {
        const feature = e?.features?.[0];
        if (!feature) return;

        const isCluster =
          !!feature.properties?.cluster || !!feature.properties?.point_count;

        if (isCluster) {
          try {
            const expansionZoom =
              await shapeSourceRef.current?.getClusterExpansionZoom(feature);
            if (expansionZoom !== undefined) {
              onClusterTap(
                feature.geometry.coordinates as [number, number],
                expansionZoom
              );
            }
          } catch (error) {
            console.warn('Failed to get cluster expansion zoom:', error);
          }
        } else {
          const spotId = feature.properties?.spotId;
          if (spotId) {
            onSpotSelect(spotId);
          }
        }
      },
      [onSpotSelect, onClusterTap]
    );

    const featureCollection = spotsToGeoJSON(spots);

    return (
      <Mapbox.ShapeSource
        id="spots"
        ref={shapeSourceRef}
        shape={featureCollection}
        cluster={true}
        clusterRadius={50}
        clusterMaxZoomLevel={14}
        onPress={handlePress}
      >
        {/* Cluster halo (background circle) */}
        <Mapbox.CircleLayer
          id="cluster-halo"
          filter={['has', 'point_count']}
          style={{
            circleColor: [
              'step',
              ['get', 'point_count'],
              THEME.ACCENT_2,
              10,
              THEME.ACCENT,
              50,
              THEME.CLUSTER_LARGE,
            ],
            circleOpacity: 0.18,
            circleRadius: [
              'step',
              ['get', 'point_count'],
              20, // small halo
              10,
              24, // medium halo
              50,
              30, // large halo
            ],
          }}
        />

        {/* Cluster circles */}
        <Mapbox.CircleLayer
          id="clusters"
          filter={['has', 'point_count']}
          style={{
            circleColor: [
              'step',
              ['get', 'point_count'],
              THEME.ACCENT_2, // 2-9
              10,
              THEME.ACCENT, // 10-49
              50,
              THEME.CLUSTER_LARGE, // 50+
            ],
            circleRadius: [
              'step',
              ['get', 'point_count'],
              14, // small (28 diameter / 2)
              10,
              18, // medium (36 / 2)
              50,
              23, // large (46 / 2)
            ],
          }}
        />

        {/* Cluster count labels */}
        <Mapbox.SymbolLayer
          id="cluster-count"
          filter={['has', 'point_count']}
          style={{
            textField: ['get', 'point_count_abbreviated'],
            textSize: [
              'step',
              ['get', 'point_count'],
              12, // small
              10,
              13, // medium
              50,
              14, // large
            ],
            textColor: THEME.CLUSTER_TEXT,
            textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            textAllowOverlap: true,
          }}
        />

        {/* Selected point halo */}
        <Mapbox.CircleLayer
          id="unclustered-point-halo"
          filter={[
            'all',
            ['!', ['has', 'point_count']],
            ['==', ['get', 'spotId'], selectedSpotId || ''],
          ]}
          style={{
            circleRadius: 22,
            circleColor: THEME.ACCENT,
            circleOpacity: 0.15,
          }}
        />

        {/* Unclustered points */}
        <Mapbox.CircleLayer
          id="unclustered-point"
          filter={['!', ['has', 'point_count']]}
          style={{
            circleRadius: [
              'case',
              ['==', ['get', 'spotId'], selectedSpotId || ''],
              7,
              5,
            ],
            circleColor: THEME.ACCENT,
            circleStrokeWidth: 2,
            circleStrokeColor: THEME.CARD,
          }}
        />

        {/* High score ring (score >= 90) */}
        <Mapbox.CircleLayer
          id="high-score-ring"
          filter={[
            'all',
            ['!', ['has', 'point_count']],
            ['>=', ['get', 'score'], 90],
          ]}
          style={{
            circleRadius: 8,
            circleColor: 'transparent',
            circleStrokeWidth: 1.5,
            circleStrokeColor: THEME.ACCENT_2,
          }}
        />
      </Mapbox.ShapeSource>
    );
  }
);
