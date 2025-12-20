package com.photospots.dto;

import java.time.OffsetDateTime;
import java.util.Map;

public class PhotoDto {
    private String id;
    private String spotId;
    private Map<String, Object> variants;
    private OffsetDateTime createdAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getSpotId() {
        return spotId;
    }

    public void setSpotId(String spotId) {
        this.spotId = spotId;
    }

    public Map<String, Object> getVariants() {
        return variants;
    }

    public void setVariants(Map<String, Object> variants) {
        this.variants = variants;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
