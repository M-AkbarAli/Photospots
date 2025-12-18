package com.photospots.service;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import io.github.cdimascio.dotenv.Dotenv;

/**
 * Seed Flickr photos into landmark + hotspot spots with geo-aware photos.
 */
@Service
public class FlickrSeedService {

    public static class SeedResult {
        private final String locationName;
        private final int totalFetched;
        private final int filteredPhotos;
        private final int insertedPhotos;
        private final int landmarkUpserts;
        private final int hotspotUpserts;
        private final int missingGeo;
        private final int missingUrl;
        private final int duplicateCount;
        private final int failedInsert;

        public SeedResult(String locationName, int totalFetched, int filteredPhotos, int insertedPhotos,
                           int landmarkUpserts, int hotspotUpserts, int missingGeo, int missingUrl,
                           int duplicateCount, int failedInsert) {
            this.locationName = locationName;
            this.totalFetched = totalFetched;
            this.filteredPhotos = filteredPhotos;
            this.insertedPhotos = insertedPhotos;
            this.landmarkUpserts = landmarkUpserts;
            this.hotspotUpserts = hotspotUpserts;
            this.missingGeo = missingGeo;
            this.missingUrl = missingUrl;
            this.duplicateCount = duplicateCount;
            this.failedInsert = failedInsert;
        }

        public String getLocationName() { return locationName; }
        public int getTotalFetched() { return totalFetched; }
        public int getFilteredPhotos() { return filteredPhotos; }
        public int getInsertedPhotos() { return insertedPhotos; }
        public int getLandmarkUpserts() { return landmarkUpserts; }
        public int getHotspotUpserts() { return hotspotUpserts; }
        public int getMissingGeo() { return missingGeo; }
        public int getMissingUrl() { return missingUrl; }
        public int getDuplicateCount() { return duplicateCount; }
        public int getFailedInsert() { return failedInsert; }
    }

    private static class FilterOutcome {
        private final List<FlickrPhoto> qualityPhotos;
        private final int missingGeo;
        private final int missingUrl;
        private final int skippedByCluster;

        private FilterOutcome(List<FlickrPhoto> qualityPhotos, int missingGeo, int missingUrl, int skippedByCluster) {
            this.qualityPhotos = qualityPhotos;
            this.missingGeo = missingGeo;
            this.missingUrl = missingUrl;
            this.skippedByCluster = skippedByCluster;
        }
    }

    private static class UpsertOutcome {
        private final int photosInserted;
        private final int landmarkUpserts;
        private final int hotspotUpserts;
        private final int failedPhotoInserts;

        private UpsertOutcome(int photosInserted, int landmarkUpserts, int hotspotUpserts, int failedPhotoInserts) {
            this.photosInserted = photosInserted;
            this.landmarkUpserts = landmarkUpserts;
            this.hotspotUpserts = hotspotUpserts;
            this.failedPhotoInserts = failedPhotoInserts;
        }
    }

    private static class FetchCounters {
        int fetched = 0;
        int missingGeo = 0;
        int outsideGta = 0;
        int outsideRadius = 0;
        int kept = 0;

        void reset() {
            fetched = 0;
            missingGeo = 0;
            outsideGta = 0;
            outsideRadius = 0;
            kept = 0;
        }
    }
    private static final String FLICKR_API_BASE = "https://api.flickr.com/services/rest/";
    private static final String EXTRAS = "url_l,url_o,url_z,url_c,url_b,geo,owner_name,views,tags";
    private static final int PER_PAGE = 100;
    private static final int HOTSPOT_PRECISION = 4; // ~11m
    private static final int MIN_PHOTOS_PER_HOTSPOT = 3;
    private static final int MAX_HOTSPOTS_PER_LANDMARK = 20;
    private static final long REQUEST_DELAY_MS = 500;

    private static final String TORONTO_GROUP_ID = "36521959@N00";
    // GTA hard boundaries (defense in depth)
    private static final double GTA_MIN_LAT = 43.10;
    private static final double GTA_MAX_LAT = 44.35;
    private static final double GTA_MIN_LNG = -80.30;

    private static final double GTA_MAX_LNG = -78.40;
    private static final double DEFAULT_RADIUS_METERS = 1500.0;

    private static final double RADIUS_MARGIN = 1.15; // 15% safety margin

    private static final int PHOTO_BATCH_SIZE = 500;
    private final RestTemplate restTemplate;

    private final JdbcTemplate jdbcTemplate;

    @Value("${flickr.api-key:}")
    private String flickrApiKey;

    @Value("${flickr.api-secret:}")
    private String flickrApiSecret;

    private final Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();

    public FlickrSeedService(RestTemplate restTemplate, JdbcTemplate jdbcTemplate) {
        this.restTemplate = restTemplate;
        this.jdbcTemplate = jdbcTemplate;
    }

    public SeedResult seedLocation(TargetLocation location) throws Exception {
        String apiKey = resolveValue(flickrApiKey, "FLICKR_API_KEY");
        if (!StringUtils.hasText(apiKey)) {
            throw new Exception("FLICKR_API_KEY is not set in environment");
        }

        System.out.println("   📍 Processing: " + location.getName());

        Set<String> seenPhotoIds = new HashSet<>();
        List<FlickrPhoto> allPhotos = new ArrayList<>();
        int duplicateCount = 0;

        FetchCounters counters = new FetchCounters();

        System.out.println("      🔍 Searching by relevance...");
        List<FlickrPhoto> relevancePhotos = clampToGtaAndRadius(location, searchPhotos(apiKey, location, "relevance"), counters);
        int relevanceCount = addUniquePhotos(relevancePhotos, allPhotos, seenPhotoIds);
        int relevanceDupes = relevancePhotos.size() - relevanceCount;
        duplicateCount += Math.max(0, relevanceDupes);
        logStrategy("relevance", counters, relevancePhotos.size(), relevanceCount, relevanceDupes);
        rateLimitDelay();

        System.out.println("      ⭐ Searching by interestingness...");
        List<FlickrPhoto> interestingPhotos = clampToGtaAndRadius(location, searchPhotos(apiKey, location, "interestingness-desc"), counters);
        int interestingCount = addUniquePhotos(interestingPhotos, allPhotos, seenPhotoIds);
        int interestingDupes = interestingPhotos.size() - interestingCount;
        duplicateCount += Math.max(0, interestingDupes);
        logStrategy("interestingness", counters, interestingPhotos.size(), interestingCount, interestingDupes);
        rateLimitDelay();

        if (location.getAlternateNames() != null && location.getAlternateNames().length > 0) {
            int altUsed = 0;
            for (String altName : location.getAlternateNames()) {
                if (altUsed >= 2) {
                    break; // cap alt-name searches
                }
                System.out.println("      🔄 Searching alternate name: " + altName);
                TargetLocation altLocation = new TargetLocation(altName,
                        location.getLatitude(), location.getLongitude(), location.getRadiusKm());
                List<FlickrPhoto> altPhotos = clampToGtaAndRadius(location, searchPhotos(apiKey, altLocation, "relevance"), counters);
                int altCount = addUniquePhotos(altPhotos, allPhotos, seenPhotoIds);
                int altDupes = altPhotos.size() - altCount;
                duplicateCount += Math.max(0, altDupes);
                logStrategy("alt-name", counters, altPhotos.size(), altCount, altDupes);
                rateLimitDelay();
                altUsed++;
            }
        }

        if (isInTorontoArea(location)) {
            System.out.println("      🏙️ Searching Toronto Flickr group...");
            List<FlickrPhoto> groupPhotos = clampToGtaAndRadius(location, searchGroup(apiKey, location.getName(), TORONTO_GROUP_ID), counters);
            int groupCount = addUniquePhotos(groupPhotos, allPhotos, seenPhotoIds);
            int groupDupes = groupPhotos.size() - groupCount;
            duplicateCount += Math.max(0, groupDupes);
            logStrategy("group", counters, groupPhotos.size(), groupCount, groupDupes);
            rateLimitDelay();
        }

        int totalFetched = allPhotos.size();

        System.out.println("      🔧 Filtering for quality...");
        FilterOutcome filtered = filterForQuality(allPhotos);
        System.out.println("         After filtering: " + filtered.qualityPhotos.size() + " photos");

        if (filtered.qualityPhotos.isEmpty()) {
            System.out.println("      ⚠️ No quality photos found for " + location.getName());
            return new SeedResult(location.getName(), totalFetched, 0, 0, 0, 0,
                    filtered.missingGeo, filtered.missingUrl, duplicateCount, 0);
        }

        System.out.println("      💾 Upserting landmark and hotspots...");
        UpsertOutcome outcome = upsertLocationHierarchy(location, filtered.qualityPhotos);
        int failedInsert = filtered.skippedByCluster + outcome.failedPhotoInserts;
        System.out.println("      ✅ Inserted/updated " + outcome.photosInserted + " photos for " + location.getName());

        return new SeedResult(
                location.getName(),
                totalFetched,
                filtered.qualityPhotos.size(),
                outcome.photosInserted,
                outcome.landmarkUpserts,
                outcome.hotspotUpserts,
                filtered.missingGeo,
                filtered.missingUrl,
                duplicateCount,
                failedInsert);
    }

    private List<FlickrPhoto> searchPhotos(String apiKey, TargetLocation location, String sortOrder) {
        try {
            StringBuilder url = new StringBuilder(FLICKR_API_BASE);
            url.append("?method=flickr.photos.search");
            url.append("&api_key=").append(apiKey);
            url.append("&text=").append(URLEncoder.encode(location.getName(), StandardCharsets.UTF_8));
            url.append("&sort=").append(sortOrder);
            url.append("&per_page=").append(PER_PAGE);
            url.append("&page=1");
            url.append("&extras=").append(EXTRAS);
            url.append("&has_geo=1");
            url.append("&safe_search=1");
            url.append("&content_type=1");
            url.append("&format=json");
            url.append("&nojsoncallback=1");
            url.append("&bbox=").append(GTA_MIN_LNG).append(",").append(GTA_MIN_LAT).append(",").append(GTA_MAX_LNG).append(",").append(GTA_MAX_LAT);

            if (location.hasCoordinates()) {
                url.append("&lat=").append(location.getLatitude());
                url.append("&lon=").append(location.getLongitude());
                url.append("&radius=").append(location.getRadiusKm());
                url.append("&radius_units=km");
                url.append("&accuracy=11");
            }

            FlickrResponse response = restTemplate.getForObject(url.toString(), FlickrResponse.class);
            if (response == null || !"ok".equals(response.getStat())) {
                System.err.println("         ⚠️ Flickr API error for " + location.getName());
                return new ArrayList<>();
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error searching: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    private List<FlickrPhoto> searchGroup(String apiKey, String searchText, String groupId) {
        try {
            StringBuilder url = new StringBuilder(FLICKR_API_BASE);
            url.append("?method=flickr.photos.search");
            url.append("&api_key=").append(apiKey);
            url.append("&group_id=").append(groupId);
            url.append("&text=").append(URLEncoder.encode(searchText, StandardCharsets.UTF_8));
            url.append("&sort=relevance");
            url.append("&per_page=50");
            url.append("&page=1");
            url.append("&extras=").append(EXTRAS);
            url.append("&has_geo=1");
            url.append("&safe_search=1");
            url.append("&format=json");
            url.append("&nojsoncallback=1");
            url.append("&bbox=").append(GTA_MIN_LNG).append(",").append(GTA_MIN_LAT).append(",").append(GTA_MAX_LNG).append(",").append(GTA_MAX_LAT);

            FlickrResponse response = restTemplate.getForObject(url.toString(), FlickrResponse.class);
            if (response == null || !"ok".equals(response.getStat())) {
                return new ArrayList<>();
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error searching group: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    private int addUniquePhotos(List<FlickrPhoto> newPhotos, List<FlickrPhoto> allPhotos, Set<String> seenIds) {
        int added = 0;
        for (FlickrPhoto photo : newPhotos) {
            if (photo.getId() != null && !seenIds.contains(photo.getId())) {
                seenIds.add(photo.getId());
                allPhotos.add(photo);
                added++;
            }
        }
        return added;
    }

    private FilterOutcome filterForQuality(List<FlickrPhoto> photos) {
        List<FlickrPhoto> filtered = new ArrayList<>();
        int missingGeo = 0;
        int missingUrl = 0;

        for (FlickrPhoto photo : photos) {
            if (!photo.hasValidGeo()) {
                missingGeo++;
                continue;
            }
            String url = photo.getBestUrl();
            if (!photo.hasMinimumResolution() || !StringUtils.hasText(url)) {
                missingUrl++;
                continue;
            }
            filtered.add(photo);
        }

        return new FilterOutcome(filtered, missingGeo, missingUrl, 0);
    }

    @Transactional
    private UpsertOutcome upsertLocationHierarchy(TargetLocation location, List<FlickrPhoto> qualityPhotos) {
        String placeSlug = slugify(location.getName());
        double[] center = determineCenter(location, qualityPhotos);
        String coverUrl = qualityPhotos.get(0).getBestUrl();

        UUID landmarkId = upsertLandmark(location, placeSlug, center[0], center[1], coverUrl, qualityPhotos.size());
        int landmarkUpserts = landmarkId != null ? 1 : 0;

        Map<String, List<FlickrPhoto>> clusters = clusterPhotos(qualityPhotos);
        int clusteredPhotoCount = clusters.values().stream().mapToInt(List::size).sum();
        int skippedByCluster = Math.max(0, qualityPhotos.size() - clusteredPhotoCount);

        Map<String, UUID> hotspotIds = upsertHotspots(location, placeSlug, landmarkId, clusters);
        int hotspotUpserts = hotspotIds.size();

        int photosInserted = insertPhotosForHotspots(hotspotIds, clusters);
        return new UpsertOutcome(photosInserted, landmarkUpserts, hotspotUpserts, skippedByCluster);
    }

    private UUID upsertLandmark(TargetLocation location, String placeSlug, double lat, double lng, String coverUrl, int photoCount) {
        String sql = "INSERT INTO spots (name, lat, lng, geom, photo_url, source, source_id, score, categories, description) " +
                "VALUES (?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, 'flickr', ?, ?, ARRAY['landmark'], ?) " +
                "ON CONFLICT (source, source_id) DO UPDATE SET " +
                "name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom, " +
                "photo_url = EXCLUDED.photo_url, score = EXCLUDED.score, categories = EXCLUDED.categories, description = EXCLUDED.description " +
                "RETURNING id";

        double score = Math.min((double) photoCount / 50.0, 1.0);
        String description = "Landmark seeded from Flickr with " + photoCount + " photos";

        List<UUID> result = jdbcTemplate.query(sql,
                (rs, rowNum) -> (UUID) rs.getObject("id"),
                location.getName(),
                lat,
                lng,
                lng,
                lat,
                coverUrl,
                "place:" + placeSlug,
                score,
                description);

        return result.isEmpty() ? null : result.get(0);
    }

    private Map<String, UUID> upsertHotspots(TargetLocation location, String placeSlug, UUID landmarkId, Map<String, List<FlickrPhoto>> clusters) {
        Map<String, UUID> hotspotIds = new HashMap<>();
        int index = 1;
        for (Map.Entry<String, List<FlickrPhoto>> entry : clusters.entrySet()) {
            String key = entry.getKey();
            List<FlickrPhoto> clusterPhotos = entry.getValue();
            double[] center = computeClusterCenter(clusterPhotos);
            String hotspotSlug = String.format("hotspot:%s:%s", placeSlug, key);
            String hotspotName = String.format("Hotspot: %s #%d", location.getName(), index++);

            String sql = "INSERT INTO spots (name, lat, lng, geom, source, source_id, categories, parent_spot_id, description, photo_url) " +
                    "VALUES (?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), 'flickr', ?, ARRAY['hotspot'], ?, ?, ?) " +
                    "ON CONFLICT (source, source_id) DO UPDATE SET " +
                    "name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom, " +
                    "categories = EXCLUDED.categories, parent_spot_id = EXCLUDED.parent_spot_id, description = EXCLUDED.description, photo_url = EXCLUDED.photo_url " +
                    "RETURNING id";

            String description = "Hotspot cluster for " + location.getName() + " with " + clusterPhotos.size() + " photos";
            String coverUrl = clusterPhotos.get(0).getBestUrl();

            List<UUID> ids = jdbcTemplate.query(sql,
                    (rs, rowNum) -> (UUID) rs.getObject("id"),
                    hotspotName,
                    center[0],
                    center[1],
                    center[1],
                    center[0],
                    hotspotSlug,
                    landmarkId,
                    description,
                    coverUrl);

            if (!ids.isEmpty()) {
                hotspotIds.put(key, ids.get(0));
            }
        }
        return hotspotIds;
    }

    private int insertPhotosForHotspots(Map<String, UUID> hotspotIds, Map<String, List<FlickrPhoto>> clusters) {
        String sql = "INSERT INTO photos (spot_id, original_key, variants, visibility, lat, lng, geom) " +
            "VALUES (?, ?, jsonb_build_object(" +
            "  'small', ?, " +
            "  'medium', ?, " +
            "  'large', ?, " +
            "  'original', ?, " +
            "  'latitude', ?::double precision, " +
            "  'longitude', ?::double precision, " +
            "  'owner_name', ?, " +
            "  'views', ?::integer, " +
            "  'title', ?" +
            "), 'public', ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)) " +
            "ON CONFLICT (original_key) DO UPDATE SET " +
            "variants = EXCLUDED.variants, visibility = EXCLUDED.visibility, lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom";

        List<Object[]> batchArgs = new ArrayList<>();
        for (Map.Entry<String, List<FlickrPhoto>> entry : clusters.entrySet()) {
            UUID hotspotId = hotspotIds.get(entry.getKey());
            if (hotspotId == null) {
                continue;
            }
            for (FlickrPhoto photo : entry.getValue()) {
                String smallUrl = photo.getUrlZ() != null ? photo.getUrlZ() : constructUrl(photo, "s");
                String mediumUrl = photo.getUrlC() != null ? photo.getUrlC() : constructUrl(photo, "m");
                String largeUrl = photo.getUrlL() != null ? photo.getUrlL() :
                        photo.getUrlB() != null ? photo.getUrlB() : constructUrl(photo, "b");
                String originalUrl = photo.getUrlO() != null ? photo.getUrlO() : largeUrl;

                double lat = photo.getLatitude();
                double lng = photo.getLongitude();

                batchArgs.add(new Object[]{
                        hotspotId,
                        "flickr:" + photo.getId(),
                        smallUrl,
                        mediumUrl,
                        largeUrl,
                        originalUrl,
                        lat,
                        lng,
                        photo.getOwnerName() != null ? photo.getOwnerName() : "Unknown",
                        photo.getViews(),
                        photo.getTitle() != null ? photo.getTitle() : "",
                        lat,
                        lng,
                        lng,
                        lat
                });
            }
        }

        if (batchArgs.isEmpty()) {
            return 0;
        }

        int inserted = 0;
        for (int start = 0; start < batchArgs.size(); start += PHOTO_BATCH_SIZE) {
            int end = Math.min(start + PHOTO_BATCH_SIZE, batchArgs.size());
            int[] results = jdbcTemplate.batchUpdate(sql, batchArgs.subList(start, end));
            for (int r : results) {
                if (r > 0) {
                    inserted += r;
                }
            }
        }
        return inserted;
    }

    private Map<String, List<FlickrPhoto>> clusterPhotos(List<FlickrPhoto> photos) {
        Map<String, List<FlickrPhoto>> clusters = new HashMap<>();
        for (FlickrPhoto photo : photos) {
            double rLat = roundToPrecision(photo.getLatitude(), HOTSPOT_PRECISION);
            double rLng = roundToPrecision(photo.getLongitude(), HOTSPOT_PRECISION);
            String key = formattedKey(rLat, rLng);
            clusters.computeIfAbsent(key, k -> new ArrayList<>()).add(photo);
        }

        return clusters.entrySet().stream()
                .filter(e -> e.getValue().size() >= MIN_PHOTOS_PER_HOTSPOT)
                .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
                .limit(MAX_HOTSPOTS_PER_LANDMARK)
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        Map.Entry::getValue,
                        (a, b) -> a,
                        LinkedHashMap::new));
    }

    private double[] determineCenter(TargetLocation location, List<FlickrPhoto> photos) {
        if (location.hasCoordinates()) {
            return new double[]{location.getLatitude(), location.getLongitude()};
        }
        double lat = 0;
        double lng = 0;
        for (FlickrPhoto photo : photos) {
            lat += photo.getLatitude();
            lng += photo.getLongitude();
        }
        return new double[]{lat / photos.size(), lng / photos.size()};
    }

    private double[] computeClusterCenter(List<FlickrPhoto> photos) {
        double lat = 0;
        double lng = 0;
        for (FlickrPhoto photo : photos) {
            lat += photo.getLatitude();
            lng += photo.getLongitude();
        }
        double avgLat = lat / photos.size();
        double avgLng = lng / photos.size();
        return new double[]{roundToPrecision(avgLat, HOTSPOT_PRECISION), roundToPrecision(avgLng, HOTSPOT_PRECISION)};
    }

    private String formattedKey(double lat, double lng) {
        return String.format("%.4f,%.4f", lat, lng);
    }

    private String constructUrl(FlickrPhoto photo, String size) {
        return String.format("https://farm%d.staticflickr.com/%s/%s_%s_%s.jpg",
            photo.getFarm(), photo.getServer(), photo.getId(), photo.getSecret(), size);
    }

    private boolean isInTorontoArea(TargetLocation location) {
        if (!location.hasCoordinates()) {
            String name = location.getName().toLowerCase();
            return name.contains("toronto") || name.contains("scarborough") ||
                   name.contains("north york") || name.contains("etobicoke") ||
                   name.contains("mississauga") || name.contains("markham") ||
                   name.contains("vaughan") || name.contains("brampton") ||
                   name.contains("gta") || name.contains("ontario");
        }
        double lat = location.getLatitude();
        double lng = location.getLongitude();
        return lat >= 43.5 && lat <= 44.0 && lng >= -79.8 && lng <= -79.0;
    }

    private void rateLimitDelay() {
        try {
            Thread.sleep(REQUEST_DELAY_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private String resolveValue(String propertyValue, String key) {
        if (StringUtils.hasText(propertyValue)) {
            return propertyValue;
        }
        String systemValue = System.getenv(key);
        if (StringUtils.hasText(systemValue)) {
            return systemValue;
        }
        String dotenvValue = dotenv.get(key);
        return StringUtils.hasText(dotenvValue) ? dotenvValue : null;
    }

    private String slugify(String input) {
        String slug = input.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
        return slug;
    }

    private double roundToPrecision(double value, int precision) {
        BigDecimal bd = BigDecimal.valueOf(value);
        bd = bd.setScale(precision, java.math.RoundingMode.HALF_UP);
        return bd.doubleValue();
    }

    private boolean isWithinGta(double lat, double lng) {
        return lat >= GTA_MIN_LAT && lat <= GTA_MAX_LAT && lng >= GTA_MIN_LNG && lng <= GTA_MAX_LNG;
    }

    private double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
        double R = 6371000.0; // meters
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private boolean isWithinTargetRadius(TargetLocation location, FlickrPhoto photo) {
        if (!location.hasCoordinates()) {
            return false;
        }
        double radiusKm = Math.max(location.getRadiusKm(), DEFAULT_RADIUS_METERS / 1000.0);
        double radiusMeters = radiusKm * 1000.0 * RADIUS_MARGIN;
        double distance = haversineMeters(location.getLatitude(), location.getLongitude(), photo.getLatitude(), photo.getLongitude());
        return distance <= radiusMeters;
    }

    private List<FlickrPhoto> clampToGtaAndRadius(TargetLocation location, List<FlickrPhoto> photos, FetchCounters counters) {
        counters.fetched += photos.size();
        List<FlickrPhoto> kept = new ArrayList<>();
        for (FlickrPhoto p : photos) {
            if (!p.hasValidGeo()) {
                counters.missingGeo++;
                continue;
            }
            if (!isWithinGta(p.getLatitude(), p.getLongitude())) {
                counters.outsideGta++;
                continue;
            }
            if (!isWithinTargetRadius(location, p)) {
                counters.outsideRadius++;
                continue;
            }
            kept.add(p);
        }
        counters.kept += kept.size();
        return kept;
    }

    private void logStrategy(String label, FetchCounters counters, int keptAfterClamp, int uniqueAdded, int dupes) {
        System.out.println(String.format("         [%s] fetched:%d geo-kept:%d gta-kept:%d radius-kept:%d kept:%d unique-added:%d dupes:%d",
                label,
                counters.fetched,
                counters.fetched - counters.missingGeo,
                counters.fetched - counters.missingGeo - counters.outsideGta,
                counters.fetched - counters.missingGeo - counters.outsideGta - counters.outsideRadius,
                keptAfterClamp,
                uniqueAdded,
                Math.max(0, dupes)));
        counters.reset();
    }
}
