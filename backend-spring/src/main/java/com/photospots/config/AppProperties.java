package com.photospots.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private final Cache cache = new Cache();

    public Cache getCache() {
        return cache;
    }

    public static class Cache {
        private int nearbySeconds = 300;
        private int spotSeconds = 600;
        private int searchSeconds = 180;
        private int hotspotsSeconds = 300;
        private int photosSeconds = 600;

        public int getNearbySeconds() {
            return nearbySeconds;
        }

        public void setNearbySeconds(int nearbySeconds) {
            this.nearbySeconds = nearbySeconds;
        }

        public int getSpotSeconds() {
            return spotSeconds;
        }

        public void setSpotSeconds(int spotSeconds) {
            this.spotSeconds = spotSeconds;
        }

        public int getSearchSeconds() {
            return searchSeconds;
        }

        public void setSearchSeconds(int searchSeconds) {
            this.searchSeconds = searchSeconds;
        }

        public int getHotspotsSeconds() {
            return hotspotsSeconds;
        }

        public void setHotspotsSeconds(int hotspotsSeconds) {
            this.hotspotsSeconds = hotspotsSeconds;
        }

        public int getPhotosSeconds() {
            return photosSeconds;
        }

        public void setPhotosSeconds(int photosSeconds) {
            this.photosSeconds = photosSeconds;
        }
    }
}
