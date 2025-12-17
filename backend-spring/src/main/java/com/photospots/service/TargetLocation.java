package com.photospots.service;

/**
 * Represents a target location to seed with photos from Flickr.
 * Contains the place name and optional coordinates for geo-filtering.
 */
public class TargetLocation {
    private final String name;
    private final Double latitude;
    private final Double longitude;
    private final double radiusKm;
    private final String[] alternateNames;

    public TargetLocation(String name, Double latitude, Double longitude, double radiusKm, String... alternateNames) {
        this.name = name;
        this.latitude = latitude;
        this.longitude = longitude;
        this.radiusKm = radiusKm;
        this.alternateNames = alternateNames;
    }

    public TargetLocation(String name, Double latitude, Double longitude) {
        this(name, latitude, longitude, 0.5);
    }

    public TargetLocation(String name) {
        this(name, null, null, 1.0);
    }

    public String getName() {
        return name;
    }

    public Double getLatitude() {
        return latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public double getRadiusKm() {
        return radiusKm;
    }

    public String[] getAlternateNames() {
        return alternateNames;
    }

    public boolean hasCoordinates() {
        return latitude != null && longitude != null;
    }

    @Override
    public String toString() {
        if (hasCoordinates()) {
            return String.format("%s (%.4f, %.4f, radius=%.1fkm)", name, latitude, longitude, radiusKm);
        }
        return name;
    }
}
