package com.photospots.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Represents a target location to seed with photos from Flickr.
 * Supports JSON-driven configuration for flexible location lists.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TargetLocation {
    private String name;
    private Double latitude;
    private Double longitude;
    private double radiusKm = 0.5;

    @JsonProperty("alt")
    private String[] alternateNames = new String[0];

    public TargetLocation() {
        // For JSON deserialization
    }

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

    public void setName(String name) {
        this.name = name;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public double getRadiusKm() {
        return radiusKm;
    }

    public void setRadiusKm(double radiusKm) {
        this.radiusKm = radiusKm;
    }

    public String[] getAlternateNames() {
        return alternateNames;
    }

    public void setAlternateNames(String[] alternateNames) {
        this.alternateNames = alternateNames != null ? alternateNames : new String[0];
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
