package com.photospots.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class FlickrPhoto {
    private String id;
    private String owner;
    private String secret;
    private String server;
    private int farm;
    private String title;
    private double latitude;
    private double longitude;
    private int accuracy;
    private String tags;
    
    // Additional fields for quality/URL
    @JsonProperty("url_l")
    private String urlL;
    
    @JsonProperty("url_o")
    private String urlO;
    
    @JsonProperty("url_z")
    private String urlZ;
    
    @JsonProperty("url_c")
    private String urlC;
    
    @JsonProperty("url_b")
    private String urlB;
    
    @JsonProperty("ownername")
    private String ownerName;
    
    private int views;
    
    @JsonProperty("width_l")
    private int widthL;
    
    @JsonProperty("height_l")
    private int heightL;
    
    @JsonProperty("width_o")
    private int widthO;
    
    @JsonProperty("height_o")
    private int heightO;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getOwner() {
        return owner;
    }

    public void setOwner(String owner) {
        this.owner = owner;
    }

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public String getServer() {
        return server;
    }

    public void setServer(String server) {
        this.server = server;
    }

    public int getFarm() {
        return farm;
    }

    public void setFarm(int farm) {
        this.farm = farm;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public double getLatitude() {
        return latitude;
    }

    public void setLatitude(double latitude) {
        this.latitude = latitude;
    }

    public double getLongitude() {
        return longitude;
    }

    public void setLongitude(double longitude) {
        this.longitude = longitude;
    }

    public int getAccuracy() {
        return accuracy;
    }

    public void setAccuracy(int accuracy) {
        this.accuracy = accuracy;
    }

    public String getTags() {
        return tags;
    }

    public void setTags(String tags) {
        this.tags = tags;
    }

    public String getUrlL() {
        return urlL;
    }

    public void setUrlL(String urlL) {
        this.urlL = urlL;
    }

    public String getUrlO() {
        return urlO;
    }

    public void setUrlO(String urlO) {
        this.urlO = urlO;
    }

    public String getUrlZ() {
        return urlZ;
    }

    public void setUrlZ(String urlZ) {
        this.urlZ = urlZ;
    }

    public String getUrlC() {
        return urlC;
    }

    public void setUrlC(String urlC) {
        this.urlC = urlC;
    }

    public String getUrlB() {
        return urlB;
    }

    public void setUrlB(String urlB) {
        this.urlB = urlB;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }

    public int getViews() {
        return views;
    }

    public void setViews(int views) {
        this.views = views;
    }

    public int getWidthL() {
        return widthL;
    }

    public void setWidthL(int widthL) {
        this.widthL = widthL;
    }

    public int getHeightL() {
        return heightL;
    }

    public void setHeightL(int heightL) {
        this.heightL = heightL;
    }

    public int getWidthO() {
        return widthO;
    }

    public void setWidthO(int widthO) {
        this.widthO = widthO;
    }

    public int getHeightO() {
        return heightO;
    }

    public void setHeightO(int heightO) {
        this.heightO = heightO;
    }
    
    /**
     * Get the best available photo URL (prefer larger sizes)
     */
    public String getBestUrl() {
        if (urlO != null && !urlO.isEmpty()) return urlO;
        if (urlL != null && !urlL.isEmpty()) return urlL;
        if (urlB != null && !urlB.isEmpty()) return urlB;
        if (urlC != null && !urlC.isEmpty()) return urlC;
        if (urlZ != null && !urlZ.isEmpty()) return urlZ;
        // Fallback to constructed URL
        return String.format("https://farm%d.staticflickr.com/%s/%s_%s_b.jpg",
            farm, server, id, secret);
    }
    
    /**
     * Check if this photo has sufficient resolution (at least 800px on one side)
     */
    public boolean hasMinimumResolution() {
        // If we have dimension info, check it
        if (widthL > 0 || heightL > 0) {
            return widthL >= 800 || heightL >= 800;
        }
        if (widthO > 0 || heightO > 0) {
            return widthO >= 800 || heightO >= 800;
        }
        // If we have url_l or url_o, assume it meets minimum
        if ((urlL != null && !urlL.isEmpty()) || (urlO != null && !urlO.isEmpty())) {
            return true;
        }
        // url_b (1024px) should be sufficient
        if (urlB != null && !urlB.isEmpty()) {
            return true;
        }
        // url_c (800px) meets minimum
        if (urlC != null && !urlC.isEmpty()) {
            return true;
        }
        // url_z (640px) is below threshold but still usable
        return urlZ != null && !urlZ.isEmpty();
    }
    
    /**
     * Check if this photo has valid geo coordinates
     */
    public boolean hasValidGeo() {
        return latitude != 0.0 && longitude != 0.0;
    }
}
