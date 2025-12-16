package com.photospots.util;

public final class GeoValidator {

    private GeoValidator() {
    }

    public static boolean isValidLatitude(double lat) {
        return lat >= -90 && lat <= 90;
    }

    public static boolean isValidLongitude(double lng) {
        return lng >= -180 && lng <= 180;
    }

    public static boolean isValidCoordinate(double lat, double lng) {
        return isValidLatitude(lat) && isValidLongitude(lng);
    }
}
