package com.photospots.service;

import java.util.List;
import java.util.Map;

public class Landmark {
    private String name;
    private int photoCount;
    private List<FlickrPhoto> photos;

    public Landmark(String name, int photoCount, List<FlickrPhoto> photos) {
        this.name = name;
        this.photoCount = photoCount;
        this.photos = photos;
    }

    public String getName() {
        return name;
    }

    public int getPhotoCount() {
        return photoCount;
    }

    public List<FlickrPhoto> getPhotos() {
        return photos;
    }
}
