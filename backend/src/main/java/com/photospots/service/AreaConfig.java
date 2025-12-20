package com.photospots.service;

public class AreaConfig {
    private String key;
    private String name;
    private double lat;
    private double lng;
    private double radiusKm;
    private double tileSpacingMeters;
    private double tileRadiusKm;

    public String getKey() {
        return key;
    }

    public String getName() {
        return name;
    }

    public double getLat() {
        return lat;
    }

    public double getLng() {
        return lng;
    }

    public double getRadiusKm() {
        return radiusKm;
    }

    public double getTileSpacingMeters() {
        return tileSpacingMeters;
    }

    public double getTileRadiusKm() {
        return tileRadiusKm;
    }
}
