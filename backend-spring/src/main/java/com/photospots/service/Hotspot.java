package com.photospots.service;

import java.util.List;

public class Hotspot {
    private double lat;
    private double lng;
    private int photoCount;
    private List<FlickrPhoto> photos;

    public Hotspot(double lat, double lng, int photoCount, List<FlickrPhoto> photos) {
        this.lat = lat;
        this.lng = lng;
        this.photoCount = photoCount;
        this.photos = photos;
    }

    public double getLat() {
        return lat;
    }

    public double getLng() {
        return lng;
    }

    public int getPhotoCount() {
        return photoCount;
    }

    public List<FlickrPhoto> getPhotos() {
        return photos;
    }
}
