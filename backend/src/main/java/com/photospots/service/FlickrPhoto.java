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

    @JsonProperty("url_m")
    private String urlM;

    @JsonProperty("url_s")
    private String urlS;
    
    @JsonProperty("url_z")
    private String urlZ;
    
    @JsonProperty("url_c")
    private String urlC;
    
    @JsonProperty("url_b")
    private String urlB;
    
    @JsonProperty("ownername")
    private String ownerName;
    
    private int views;
    
    @JsonProperty("dateupload")
    private long dateUpload;
    
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

    public String getUrlM() {
        return urlM;
    }

    public void setUrlM(String urlM) {
        this.urlM = urlM;
    }

    public String getUrlS() {
        return urlS;
    }

    public void setUrlS(String urlS) {
        this.urlS = urlS;
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

    public long getDateUpload() {
        return dateUpload;
    }

    public void setDateUpload(long dateUpload) {
        this.dateUpload = dateUpload;
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
        if (urlL != null && !urlL.isEmpty()) return urlL;
        if (urlM != null && !urlM.isEmpty()) return urlM;
        if (urlS != null && !urlS.isEmpty()) return urlS;
        if (urlO != null && !urlO.isEmpty()) return urlO;
        if (urlB != null && !urlB.isEmpty()) return urlB;
        if (urlC != null && !urlC.isEmpty()) return urlC;
        if (urlZ != null && !urlZ.isEmpty()) return urlZ;
        return String.format("https://farm%d.staticflickr.com/%s/%s_%s_m.jpg",
            farm, server, id, secret);
    }
    
    /**
     * Check if this photo has sufficient resolution (at least 800px on one side)
     */
    public boolean hasMinimumResolution() {
        if (widthO > 0 && heightO > 0) {
            long pixels = (long) widthO * (long) heightO;
            return pixels >= 250_000;
        }
        if (widthL > 0 && heightL > 0) {
            long pixels = (long) widthL * (long) heightL;
            return pixels >= 250_000;
        }
        if ((urlL != null && !urlL.isEmpty()) || (urlB != null && !urlB.isEmpty()) ||
            (urlC != null && !urlC.isEmpty()) || (urlM != null && !urlM.isEmpty()) ||
            (urlO != null && !urlO.isEmpty())) {
            return true;
        }
        return urlS != null && !urlS.isEmpty();
    }
    
    /**
     * Check if this photo has valid geo coordinates
     */
    public boolean hasValidGeo() {
        return latitude != 0.0 && longitude != 0.0;
    }
}
