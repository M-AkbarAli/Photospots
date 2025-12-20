package com.photospots.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class FlickrResponse {
    private Photos photos;
    private String stat;

    public Photos getPhotos() {
        return photos;
    }

    public void setPhotos(Photos photos) {
        this.photos = photos;
    }

    public String getStat() {
        return stat;
    }

    public void setStat(String stat) {
        this.stat = stat;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Photos {
        @com.fasterxml.jackson.annotation.JsonProperty("photo")
        private List<FlickrPhoto> photo = new ArrayList<>();
        private int pages;
        private int total;

        public List<FlickrPhoto> getPhoto() {
            return photo;
        }

        public void setPhoto(List<FlickrPhoto> photo) {
            this.photo = photo;
        }

        public int getPages() {
            return pages;
        }

        public void setPages(int pages) {
            this.pages = pages;
        }

        public int getTotal() {
            return total;
        }

        public void setTotal(int total) {
            this.total = total;
        }
    }
}
