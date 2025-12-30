package com.photospots.service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

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
        private final int conflictSkipped;
        private final int failedInsert;
        private final int photosAttempted;

        public SeedResult(String locationName, int totalFetched, int filteredPhotos, int insertedPhotos,
                           int landmarkUpserts, int hotspotUpserts, int missingGeo, int missingUrl,
                           int duplicateCount, int conflictSkipped, int failedInsert, int photosAttempted) {
            this.locationName = locationName;
            this.totalFetched = totalFetched;
            this.filteredPhotos = filteredPhotos;
            this.insertedPhotos = insertedPhotos;
            this.landmarkUpserts = landmarkUpserts;
            this.hotspotUpserts = hotspotUpserts;
            this.missingGeo = missingGeo;
            this.missingUrl = missingUrl;
            this.duplicateCount = duplicateCount;
            this.conflictSkipped = conflictSkipped;
            this.failedInsert = failedInsert;
            this.photosAttempted = photosAttempted;
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
        public int getConflictSkipped() { return conflictSkipped; }
        public int getFailedInsert() { return failedInsert; }
        public int getPhotosAttempted() { return photosAttempted; }
    }

    private static class FilterOutcome {
        private final List<FlickrPhoto> qualityPhotos;
        private final int missingGeo;
        private final int missingUrl;
        private final int skippedByCluster;
        private final int suspectRejects;

        private FilterOutcome(List<FlickrPhoto> qualityPhotos, int missingGeo, int missingUrl, int skippedByCluster, int suspectRejects) {
            this.qualityPhotos = qualityPhotos;
            this.missingGeo = missingGeo;
            this.missingUrl = missingUrl;
            this.skippedByCluster = skippedByCluster;
            this.suspectRejects = suspectRejects;
        }
    }

    private static class UpsertOutcome {
        private final int photosInserted;
        private final int landmarkUpserts;
        private final int hotspotUpserts;
        private final int photosAttempted;
        private final int conflictSkipped;
        private final int failedPhotoInserts;
        private final int portraitRejects;
        private final int blurryRejects;
        private final boolean fallbackUsed;

        private UpsertOutcome(int photosInserted, int landmarkUpserts, int hotspotUpserts, int photosAttempted,
                               int conflictSkipped, int failedPhotoInserts, int portraitRejects, int blurryRejects,
                               boolean fallbackUsed) {
            this.photosInserted = photosInserted;
            this.landmarkUpserts = landmarkUpserts;
            this.hotspotUpserts = hotspotUpserts;
            this.photosAttempted = photosAttempted;
            this.conflictSkipped = conflictSkipped;
            this.failedPhotoInserts = failedPhotoInserts;
            this.portraitRejects = portraitRejects;
            this.blurryRejects = blurryRejects;
            this.fallbackUsed = fallbackUsed;
        }
    }

    private static class InsertStats {
        private final int attempted;
        private final int inserted;
        private final int conflicts;
        private final int failed;

        private InsertStats(int attempted, int inserted, int conflicts, int failed) {
            this.attempted = attempted;
            this.inserted = inserted;
            this.conflicts = conflicts;
            this.failed = failed;
        }
    }

    private static class VisionResult {
        private final double faceMaxFrac;
        private final int faceCount;
        private final double blurScore;
        private final boolean portrait;
        private final boolean blurry;

        private VisionResult(double faceMaxFrac, int faceCount, double blurScore, boolean portrait, boolean blurry) {
            this.faceMaxFrac = faceMaxFrac;
            this.faceCount = faceCount;
            this.blurScore = blurScore;
            this.portrait = portrait;
            this.blurry = blurry;
        }

        public boolean isPortrait() { return portrait; }
        public boolean isBlurry() { return blurry; }
        public double getFaceMaxFrac() { return faceMaxFrac; }
        public int getFaceCount() { return faceCount; }
        public double getBlurScore() { return blurScore; }
    }

    private static class VisionOutcome {
        private final Map<String, List<FlickrPhoto>> filteredClusters;
        private final List<FlickrPhoto> filteredPhotos;
        private final Map<String, VisionResult> qaByPhotoKey;
        private final int portraitRejected;
        private final int blurryRejected;

        // Constructor for cluster-based filtering
        private VisionOutcome(Map<String, List<FlickrPhoto>> filteredClusters,
                              Map<String, VisionResult> qaByPhotoKey,
                              int portraitRejected,
                              int blurryRejected) {
            this.filteredClusters = filteredClusters;
            this.filteredPhotos = null;
            this.qaByPhotoKey = qaByPhotoKey;
            this.portraitRejected = portraitRejected;
            this.blurryRejected = blurryRejected;
        }

        // Constructor for list-based filtering
        private VisionOutcome(List<FlickrPhoto> filteredPhotos,
                              Map<String, VisionResult> qaByPhotoKey,
                              int portraitRejected,
                              int blurryRejected,
                              boolean isList) {
            this.filteredClusters = null;
            this.filteredPhotos = filteredPhotos;
            this.qaByPhotoKey = qaByPhotoKey;
            this.portraitRejected = portraitRejected;
            this.blurryRejected = blurryRejected;
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
    private static class ClusterCandidate {
        private final String key;
        private final List<FlickrPhoto> photos;
        private final double[] center;
        private final double score;

        private ClusterCandidate(String key, List<FlickrPhoto> photos, double[] center, double score) {
            this.key = key;
            this.photos = photos;
            this.center = center;
            this.score = score;
        }
    }
    private static final String FLICKR_API_BASE = "https://api.flickr.com/services/rest/";
    private static final String EXTRAS = "url_s,url_m,url_l,url_o,geo,owner_name,views,tags,o_dims";
    private static final int PER_PAGE = 100;
    private static final int HOTSPOT_PRECISION = 4; // ~11m
    private static final int MIN_PHOTOS_PER_HOTSPOT = 3;
    private static final int MAX_HOTSPOTS_PER_LANDMARK = 20;
    private static final int MAX_PHOTOS_PER_HOTSPOT = 30;
    private static final int MIN_LANDMARK_PHOTOS_FOR_FALLBACK = 8;
    private static final int MAX_HOTSPOTS_PER_AREA = 60;
    private static final double MIN_HOTSPOT_SEPARATION_METERS = 80.0;

    private static final long REQUEST_DELAY_MS = 500;
    private static final String TORONTO_GROUP_ID = "36521959@N00";
    // GTA hard boundaries (defense in depth)
    private static final double GTA_MIN_LAT = 43.10;
    private static final double GTA_MAX_LAT = 44.35;

    private static final double GTA_MIN_LNG = -80.30;
    private static final double GTA_MAX_LNG = -78.40;

    private static final double DEFAULT_RADIUS_METERS = 1500.0;
    private static final double RADIUS_MARGIN = 1.15; // 15% safety margin

        private static final String TILE_TAGS = "streetart,graffiti,mural,architecture,cityscape,skyline,bridge,waterfront,park,trail,lookout";
        private static final int PHOTO_BATCH_SIZE = 500;

            private static final String[] EXCLUDE_TOKENS = new String[]{
                "selfie", "portrait", "headshot", "model", "fashion", "wedding", "engagement",
                "bird", "birds", "wildlife", "owl", "hawk", "eagle", "duck", "goose", "dog", "puppy", "cat", "kitten",
                "food", "meal", "dinner", "lunch", "coffee"
            };
        private static final Set<String> SUSPECT_TOKENS = Set.of(EXCLUDE_TOKENS);
        private static final Set<String> BASE_LOCATION_TOKENS = Set.of("toronto", "ontario", "canada");
        private static final int CANDIDATES_PER_HOTSPOT = 120;
        private static final int BLUR_THRESHOLD = 60;

        private static final int PYTHON_TIMEOUT_SECONDS = 45;

        private static final String VISION_SCRIPT = Paths.get("tools", "photo_filter", "filter_photos.py").toString();

        private final RestTemplate restTemplate;
        private final JdbcTemplate jdbcTemplate;
        private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, VisionResult> visionCache = new HashMap<>();

    @Value("${flickr.api-key:}")
    private String flickrApiKey;

    @Value("${flickr.api-secret:}")
    private String flickrApiSecret;

    private final Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();

    public FlickrSeedService(RestTemplate restTemplate, JdbcTemplate jdbcTemplate) {
        this.restTemplate = restTemplate;
        this.jdbcTemplate = jdbcTemplate;
    }

    public SeedResult seedLocation(TargetLocation location, boolean visionEnabled) throws Exception {
        String apiKey = resolveValue(flickrApiKey, "FLICKR_API_KEY");
        if (!StringUtils.hasText(apiKey)) {
            throw new Exception("FLICKR_API_KEY is not set in environment");
        }

        System.out.println("   📍 Processing: " + location.getName());

        double baseRadius = Math.max(location.getRadiusKm(), 2.0);
        double[] radiusAttempts = new double[]{
            baseRadius,
            Math.max(baseRadius, 5.0),
            Math.max(baseRadius, 10.0)
        };

        Set<String> seenPhotoIds = new HashSet<>();
        List<FlickrPhoto> allPhotos = new ArrayList<>();
        int duplicateCount = 0;
        FilterOutcome filtered = null;
        UpsertOutcome outcome = null;
        int totalFetched = 0;

        for (double attemptRadius : radiusAttempts) {
            TargetLocation attemptLocation = new TargetLocation(
                    location.getName(),
                    location.getLatitude(),
                    location.getLongitude(),
                    attemptRadius,
                    location.getAlternateNames());

            System.out.println("      🔁 Search attempt radiusKm=" + attemptRadius);
            allPhotos.clear();
            seenPhotoIds.clear();
            duplicateCount = 0;
            FetchCounters counters = new FetchCounters();

            System.out.println("      🔍 Searching by relevance...");
            List<FlickrPhoto> relevancePhotos = clampToGtaAndRadius(attemptLocation, searchPhotos(apiKey, attemptLocation, "relevance"), counters);
            int relevanceCount = addUniquePhotos(relevancePhotos, allPhotos, seenPhotoIds);
            int relevanceDupes = relevancePhotos.size() - relevanceCount;
            duplicateCount += Math.max(0, relevanceDupes);
            logStrategy("relevance", counters, relevancePhotos.size(), relevanceCount, relevanceDupes);
            rateLimitDelay();

            System.out.println("      ⭐ Searching by interestingness...");
            List<FlickrPhoto> interestingPhotos = clampToGtaAndRadius(attemptLocation, searchPhotos(apiKey, attemptLocation, "interestingness-desc"), counters);
            int interestingCount = addUniquePhotos(interestingPhotos, allPhotos, seenPhotoIds);
            int interestingDupes = interestingPhotos.size() - interestingCount;
            duplicateCount += Math.max(0, interestingDupes);
            logStrategy("interestingness", counters, interestingPhotos.size(), interestingCount, interestingDupes);
            rateLimitDelay();

            if (attemptLocation.getAlternateNames() != null && attemptLocation.getAlternateNames().length > 0) {
                int altUsed = 0;
                for (String altName : attemptLocation.getAlternateNames()) {
                    if (altUsed >= 2) {
                        break; // cap alt-name searches
                    }
                    System.out.println("      🔄 Searching alternate name: " + altName);
                    TargetLocation altLocation = new TargetLocation(altName,
                            attemptLocation.getLatitude(), attemptLocation.getLongitude(), attemptLocation.getRadiusKm());
                    List<FlickrPhoto> altPhotos = clampToGtaAndRadius(attemptLocation, searchPhotos(apiKey, altLocation, "relevance"), counters);
                    int altCount = addUniquePhotos(altPhotos, allPhotos, seenPhotoIds);
                    int altDupes = altPhotos.size() - altCount;
                    duplicateCount += Math.max(0, altDupes);
                    logStrategy("alt-name", counters, altPhotos.size(), altCount, altDupes);
                    rateLimitDelay();
                    altUsed++;
                }
            }

            if (isInTorontoArea(attemptLocation)) {
                System.out.println("      🏙️ Searching Toronto Flickr group...");
                List<FlickrPhoto> groupPhotos = clampToGtaAndRadius(attemptLocation, searchGroup(apiKey, attemptLocation, TORONTO_GROUP_ID), counters);
                int groupCount = addUniquePhotos(groupPhotos, allPhotos, seenPhotoIds);
                int groupDupes = groupPhotos.size() - groupCount;
                duplicateCount += Math.max(0, groupDupes);
                logStrategy("group", counters, groupPhotos.size(), groupCount, groupDupes);
                rateLimitDelay();
            }

            totalFetched = allPhotos.size();

            if (totalFetched == 0) {
                System.out.println("      ↩️ No radius-kept photos at radiusKm=" + attemptRadius + ", trying next radius...");
                continue;
            }

            System.out.println("      🔧 Filtering for quality...");
            filtered = filterForQuality(attemptLocation, allPhotos);
            System.out.println("         After metadata filters: " + filtered.qualityPhotos.size() + " photos (missingGeo=" +
                filtered.missingGeo + ", missingUrl/size=" + filtered.missingUrl + ", suspect=" + filtered.suspectRejects + ")");

            if (filtered.qualityPhotos.isEmpty()) {
                System.out.println("      ⚠️ No quality photos found for " + attemptLocation.getName() + " at radiusKm=" + attemptRadius + "; stopping fallback ladder because radius-kept > 0");
                return new SeedResult(
                        attemptLocation.getName(),
                        totalFetched,
                        0,
                        0,
                        0,
                        0,
                        filtered.missingGeo,
                        filtered.missingUrl,
                        duplicateCount,
                    0,
                    0,
                    0);
            }

            System.out.println("      💾 Upserting landmark and photos...");
            outcome = upsertLocationHierarchy(attemptLocation, filtered.qualityPhotos, visionEnabled);
            int failedInsert = outcome.failedPhotoInserts;
            System.out.println("      🧠 Vision rejections — portraits: " + outcome.portraitRejects + ", blurry: " + outcome.blurryRejects);
            System.out.println("      📊 Counts — filtered:" + filtered.qualityPhotos.size() +
                    " attempted:" + outcome.photosAttempted +
                    " inserted:" + outcome.photosInserted +
                    " conflict-skipped:" + outcome.conflictSkipped +
                    " failed:" + outcome.failedPhotoInserts);
            System.out.println("      ✅ Inserted/updated " + outcome.photosInserted + " photos for " + attemptLocation.getName());

            return new SeedResult(
                    attemptLocation.getName(),
                    totalFetched,
                    filtered.qualityPhotos.size(),
                    outcome.photosInserted,
                    outcome.landmarkUpserts,
                    0,
                    filtered.missingGeo,
                    filtered.missingUrl,
                    duplicateCount,
                    outcome.conflictSkipped,
                    failedInsert,
                    outcome.photosAttempted);
        }

        // If all radius attempts failed
        return new SeedResult(location.getName(), totalFetched, 0, 0, 0, 0,
            filtered != null ? filtered.missingGeo : 0,
            filtered != null ? filtered.missingUrl : 0,
            duplicateCount,
            0,
            0,
            0);
    }

    public SeedResult seedArea(AreaConfig area, boolean visionEnabled) throws Exception {
        String apiKey = resolveValue(flickrApiKey, "FLICKR_API_KEY");
        if (!StringUtils.hasText(apiKey)) {
            throw new Exception("FLICKR_API_KEY is not set in environment");
        }

        System.out.println("   🗺️  Area mode: " + area.getName() + " (key=" + area.getKey() + ")");

        List<TargetLocation> tiles = buildTiles(area);
        System.out.println("   🔲 Tiles generated: " + tiles.size());

        Set<String> seenPhotoIds = new HashSet<>();
        List<FlickrPhoto> allFiltered = new ArrayList<>();
        int duplicateCount = 0;
        int totalFetched = 0;
        int totalMissingGeo = 0;
        int totalMissingUrl = 0;

        int tileIdx = 0;
        for (TargetLocation tile : tiles) {
            tileIdx++;
            System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            System.out.println("   🧭 Tile " + tileIdx + "/" + tiles.size() + " — " + tile.getName());

            FetchCounters counters = new FetchCounters();
            List<FlickrPhoto> tilePhotos = new ArrayList<>();

            int tileFetchedTotal = 0;
            int tileRadiusKeptTotal = 0;
            int tileUniqueAdded = 0;

            // Query A: geo-only discovery, sorted by interestingness
            List<FlickrPhoto> interesting = clampToGtaAndRadius(tile, searchPhotosGeo(apiKey, tile, "interestingness-desc"), counters);
            tileFetchedTotal += counters.fetched;
            tileRadiusKeptTotal += interesting.size();
            int interestingAdded = addUniquePhotos(interesting, tilePhotos, seenPhotoIds);
            tileUniqueAdded += interestingAdded;
            duplicateCount += Math.max(0, interesting.size() - interestingAdded);
            logStrategy("tile-interesting", counters, interesting.size(), interestingAdded, interesting.size() - interestingAdded);
            rateLimitDelay();

            // Query B: geo + street/urban tags, sorted by relevance
            List<FlickrPhoto> tagged = clampToGtaAndRadius(tile, searchPhotosGeoWithTags(apiKey, tile, "relevance", TILE_TAGS), counters);
            tileFetchedTotal += counters.fetched;
            tileRadiusKeptTotal += tagged.size();
            int taggedAdded = addUniquePhotos(tagged, tilePhotos, seenPhotoIds);
            tileUniqueAdded += taggedAdded;
            duplicateCount += Math.max(0, tagged.size() - taggedAdded);
            logStrategy("tile-tags", counters, tagged.size(), taggedAdded, tagged.size() - taggedAdded);
            rateLimitDelay();

            totalFetched += tileFetchedTotal;

            FilterOutcome tileFiltered = filterForQuality(tile, tilePhotos);
            totalMissingGeo += tileFiltered.missingGeo;
            totalMissingUrl += tileFiltered.missingUrl;
            allFiltered.addAll(tileFiltered.qualityPhotos);

            System.out.println("   📊 Tile summary — fetched:" + tileFetchedTotal +
                    " radius-kept:" + tileRadiusKeptTotal +
                    " unique-added:" + tileUniqueAdded +
                    " filtered:" + tileFiltered.qualityPhotos.size());
        }

        if (allFiltered.isEmpty()) {
            System.out.println("   ⚠️ Area yielded 0 filtered photos");
            return new SeedResult(area.getName(), totalFetched, 0, 0, 0, 0, totalMissingGeo, totalMissingUrl, duplicateCount, 0, 0, 0);
        }

        String coverUrl = chooseDisplayUrl(allFiltered.get(0));
        UUID areaLandmarkId = upsertAreaLandmark(area, coverUrl, allFiltered.size());
        int landmarkUpserts = areaLandmarkId != null ? 1 : 0;

        if (areaLandmarkId == null) {
            System.out.println("   ⚠️ Failed to upsert area landmark");
            return new SeedResult(area.getName(), totalFetched, 0, 0, 0, 0, totalMissingGeo, totalMissingUrl, duplicateCount, 0, 0, 0);
        }

        // Apply vision filtering to all photos
        VisionOutcome visionOutcome = applyVisionFilteringToList(allFiltered, visionEnabled);

        InsertStats insertStats = insertPhotosForLandmark(areaLandmarkId, visionOutcome.filteredPhotos, visionOutcome.qaByPhotoKey);

        int uniqueCandidates = allFiltered.size();
        int newCandidates = insertStats.inserted;

        System.out.println("   📈 Area candidates — unique collected:" + uniqueCandidates +
            " new (not-in-DB):" + newCandidates);
        System.out.println("   🧠 Vision rejections — portraits: " + visionOutcome.portraitRejected + ", blurry: " + visionOutcome.blurryRejected);
        if (newCandidates == 0) {
            System.out.println("   ℹ️  Area already populated; no new photos available under current search settings.");
        }

        System.out.println("   ✅ Area upsert complete — " +
                " attempted:" + insertStats.attempted +
                " inserted:" + insertStats.inserted +
                " conflict-skipped:" + insertStats.conflicts +
                " failed:" + insertStats.failed);

        return new SeedResult(area.getName(), totalFetched, allFiltered.size(), insertStats.inserted, landmarkUpserts,
                0, totalMissingGeo, totalMissingUrl, duplicateCount, insertStats.conflicts, insertStats.failed, insertStats.attempted);
    }

    private List<FlickrPhoto> searchPhotosGeo(String apiKey, TargetLocation location, String sortOrder) {
        try {
            StringBuilder url = new StringBuilder(FLICKR_API_BASE);
            url.append("?method=flickr.photos.search");
            url.append("&api_key=").append(apiKey);
            url.append("&sort=").append(sortOrder);
            url.append("&per_page=").append(PER_PAGE);
            url.append("&page=1");
            url.append("&extras=").append(EXTRAS);
            url.append("&has_geo=1");
            url.append("&safe_search=1");
            url.append("&content_type=1");
            url.append("&format=json");
            url.append("&nojsoncallback=1");

            if (location.hasCoordinates()) {
                url.append("&lat=").append(location.getLatitude());
                url.append("&lon=").append(location.getLongitude());
                url.append("&radius=").append(location.getRadiusKm());
                url.append("&radius_units=km");
                url.append("&accuracy=11");
            } else {
                url.append("&bbox=").append(GTA_MIN_LNG).append(",").append(GTA_MIN_LAT).append(",").append(GTA_MAX_LNG).append(",").append(GTA_MAX_LAT);
            }

            FlickrResponse response = restTemplate.getForObject(url.toString(), FlickrResponse.class);
            if (response == null || !"ok".equals(response.getStat())) {
                System.err.println("         ⚠️ Flickr API error for geo search sort=" + sortOrder);
                return new ArrayList<>();
            }
            if (response.getPhotos() == null || response.getPhotos().getPhoto() == null || response.getPhotos().getPhoto().isEmpty()) {
                if (location.hasCoordinates()) {
                    System.out.println("         ⚠️ Flickr returned 0 photos for geo query sort=" + sortOrder +
                            " lat=" + location.getLatitude() + " lon=" + location.getLongitude() + " radius=" + location.getRadiusKm());
                } else {
                    System.out.println("         ⚠️ Flickr returned 0 photos for geo query sort=" + sortOrder +
                            " bbox=" + GTA_MIN_LNG + "," + GTA_MIN_LAT + "," + GTA_MAX_LNG + "," + GTA_MAX_LAT);
                }
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error searching geo: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    private List<FlickrPhoto> searchPhotosGeoWithTags(String apiKey, TargetLocation location, String sortOrder, String tags) {
        try {
            StringBuilder url = new StringBuilder(FLICKR_API_BASE);
            url.append("?method=flickr.photos.search");
            url.append("&api_key=").append(apiKey);
            url.append("&sort=").append(sortOrder);
            url.append("&per_page=").append(PER_PAGE);
            url.append("&page=1");
            url.append("&extras=").append(EXTRAS);
            url.append("&has_geo=1");
            url.append("&safe_search=1");
            url.append("&content_type=1");
            url.append("&format=json");
            url.append("&nojsoncallback=1");

            if (StringUtils.hasText(tags)) {
                url.append("&tags=").append(URLEncoder.encode(tags, StandardCharsets.UTF_8));
                url.append("&tag_mode=any");
            }

            if (location.hasCoordinates()) {
                url.append("&lat=").append(location.getLatitude());
                url.append("&lon=").append(location.getLongitude());
                url.append("&radius=").append(location.getRadiusKm());
                url.append("&radius_units=km");
                url.append("&accuracy=11");
            } else {
                url.append("&bbox=").append(GTA_MIN_LNG).append(",").append(GTA_MIN_LAT).append(",").append(GTA_MAX_LNG).append(",").append(GTA_MAX_LAT);
            }

            FlickrResponse response = restTemplate.getForObject(url.toString(), FlickrResponse.class);
            if (response == null || !"ok".equals(response.getStat())) {
                System.err.println("         ⚠️ Flickr API error for tagged geo search sort=" + sortOrder);
                return new ArrayList<>();
            }
            if (response.getPhotos() == null || response.getPhotos().getPhoto() == null || response.getPhotos().getPhoto().isEmpty()) {
                if (location.hasCoordinates()) {
                    System.out.println("         ⚠️ Flickr returned 0 photos for tagged geo query sort=" + sortOrder +
                            " lat=" + location.getLatitude() + " lon=" + location.getLongitude() + " radius=" + location.getRadiusKm());
                } else {
                    System.out.println("         ⚠️ Flickr returned 0 photos for tagged geo query sort=" + sortOrder +
                            " bbox=" + GTA_MIN_LNG + "," + GTA_MIN_LAT + "," + GTA_MAX_LNG + "," + GTA_MAX_LAT);
                }
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error searching tagged geo: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    private List<FlickrPhoto> searchPhotos(String apiKey, TargetLocation location, String sortOrder) {
        try {
            StringBuilder url = new StringBuilder(FLICKR_API_BASE);
            url.append("?method=flickr.photos.search");
            url.append("&api_key=").append(apiKey);
            url.append("&text=").append(URLEncoder.encode(buildLocalText(location), StandardCharsets.UTF_8));
            url.append("&sort=").append(sortOrder);
            url.append("&per_page=").append(PER_PAGE);
            url.append("&page=1");
            url.append("&extras=").append(EXTRAS);
            url.append("&has_geo=1");
            url.append("&safe_search=1");
            url.append("&content_type=1");
            url.append("&format=json");
            url.append("&nojsoncallback=1");

            if (location.hasCoordinates()) {
                url.append("&lat=").append(location.getLatitude());
                url.append("&lon=").append(location.getLongitude());
                url.append("&radius=").append(location.getRadiusKm());
                url.append("&radius_units=km");
                url.append("&accuracy=11");
            } else {
                url.append("&bbox=").append(GTA_MIN_LNG).append(",").append(GTA_MIN_LAT).append(",").append(GTA_MAX_LNG).append(",").append(GTA_MAX_LAT);
            }

            FlickrResponse response = restTemplate.getForObject(url.toString(), FlickrResponse.class);
            if (response == null || !"ok".equals(response.getStat())) {
                System.err.println("         ⚠️ Flickr API error for " + location.getName());
                return new ArrayList<>();
            }
            if (response.getPhotos() == null || response.getPhotos().getPhoto() == null || response.getPhotos().getPhoto().isEmpty()) {
                System.out.println("         ⚠️ Flickr returned 0 photos for text='" + buildLocalText(location) + "' sort=" + sortOrder +
                        (location.hasCoordinates() ? " lat=" + location.getLatitude() + " lon=" + location.getLongitude() + " radius=" + location.getRadiusKm() : " bbox=" + GTA_MIN_LNG + "," + GTA_MIN_LAT + "," + GTA_MAX_LNG + "," + GTA_MAX_LAT));
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error searching: " + e.getMessage());
            return new ArrayList<>();
        }
    }

        private List<FlickrPhoto> searchGroup(String apiKey, TargetLocation location, String groupId) {
            try {
                StringBuilder url = new StringBuilder(FLICKR_API_BASE);
                url.append("?method=flickr.photos.search");
                url.append("&api_key=").append(apiKey);
                url.append("&group_id=").append(groupId);
                url.append("&text=").append(URLEncoder.encode(buildLocalText(location), StandardCharsets.UTF_8));
                url.append("&sort=relevance");
                url.append("&per_page=50");
                url.append("&page=1");
                url.append("&extras=").append(EXTRAS);
                url.append("&has_geo=1");
                url.append("&safe_search=1");
                url.append("&format=json");
                url.append("&nojsoncallback=1");
                if (location.hasCoordinates()) {
                    url.append("&lat=").append(location.getLatitude());
                    url.append("&lon=").append(location.getLongitude());
                    url.append("&radius=").append(location.getRadiusKm());
                    url.append("&radius_units=km");
                    url.append("&accuracy=11");
                } else {
                    url.append("&bbox=").append(GTA_MIN_LNG).append(",").append(GTA_MIN_LAT).append(",").append(GTA_MAX_LNG).append(",").append(GTA_MAX_LAT);
                }

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

    private FilterOutcome filterForQuality(TargetLocation location, List<FlickrPhoto> photos) {
        List<FlickrPhoto> filtered = new ArrayList<>();
        int missingGeo = 0;
        int missingUrl = 0;
        int suspectRejects = 0;

        Set<String> locationTokens = buildLocationTokens(location);

        for (FlickrPhoto photo : photos) {
            if (!photo.hasValidGeo()) {
                missingGeo++;
                continue;
            }
            String url = chooseDisplayUrl(photo);
            if (!StringUtils.hasText(url)) {
                missingUrl++;
                continue;
            }
            if (!photo.hasMinimumResolution()) {
                missingUrl++;
                continue;
            }
            if (isSuspectSubject(photo, locationTokens)) {
                suspectRejects++;
                continue;
            }
            filtered.add(photo);
        }

        return new FilterOutcome(filtered, missingGeo, missingUrl, 0, suspectRejects);
    }

    @Transactional
    private UpsertOutcome upsertLocationHierarchy(TargetLocation location, List<FlickrPhoto> qualityPhotos, boolean visionEnabled) {
        String placeSlug = slugify(location.getName());
        double[] center = determineCenter(location, qualityPhotos);
        String coverUrl = chooseDisplayUrl(qualityPhotos.get(0));

        UUID landmarkId = upsertLandmark(location, placeSlug, center[0], center[1], coverUrl, qualityPhotos.size());
        int landmarkUpserts = landmarkId != null ? 1 : 0;

        if (landmarkId == null) {
            return new UpsertOutcome(0, 0, 0, 0, 0, 0, 0, 0, false);
        }

        // Apply vision filtering before inserting photos
        VisionOutcome visionOutcome = applyVisionFilteringToList(qualityPhotos, visionEnabled);

        InsertStats insertStats = insertPhotosForLandmark(landmarkId, visionOutcome.filteredPhotos, visionOutcome.qaByPhotoKey);

        return new UpsertOutcome(insertStats.inserted, landmarkUpserts, 0, insertStats.attempted,
            insertStats.conflicts, insertStats.failed, visionOutcome.portraitRejected, visionOutcome.blurryRejected, false);
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

    private UUID upsertAreaLandmark(AreaConfig area, String coverUrl, int photoCount) {
        String sql = "INSERT INTO spots (name, lat, lng, geom, photo_url, source, source_id, score, categories, description) " +
                "VALUES (?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, 'flickr', ?, ?, ARRAY['area'], ?) " +
                "ON CONFLICT (source, source_id) DO UPDATE SET " +
                "name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom, " +
                "photo_url = EXCLUDED.photo_url, score = EXCLUDED.score, categories = EXCLUDED.categories, description = EXCLUDED.description " +
                "RETURNING id";

        double score = Math.min((double) photoCount / 100.0, 1.0);
        String description = "Area seeded from Flickr with " + photoCount + " photos";

        List<UUID> result = jdbcTemplate.query(sql,
                (rs, rowNum) -> (UUID) rs.getObject("id"),
                area.getName(),
                area.getLat(),
                area.getLng(),
                area.getLng(),
                area.getLat(),
                coverUrl,
                "area:" + area.getKey(),
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
            String coverUrl = chooseDisplayUrl(clusterPhotos.get(0));

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

    private Map<String, UUID> upsertAreaHotspots(AreaConfig area, UUID areaLandmarkId, Map<String, List<FlickrPhoto>> clusters) {
        Map<String, UUID> hotspotIds = new HashMap<>();
        int index = 1;
        for (Map.Entry<String, List<FlickrPhoto>> entry : clusters.entrySet()) {
            String key = entry.getKey();
            List<FlickrPhoto> clusterPhotos = entry.getValue();
            double[] center = computeClusterCenter(clusterPhotos);
            String hotspotSlug = String.format("area:%s:hotspot:%s", area.getKey(), key);
            String hotspotName = String.format("Hotspot: %s #%d", area.getName(), index++);

            String sql = "INSERT INTO spots (name, lat, lng, geom, source, source_id, categories, parent_spot_id, description, photo_url) " +
                    "VALUES (?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), 'flickr', ?, ARRAY['hotspot'], ?, ?, ?) " +
                    "ON CONFLICT (source, source_id) DO UPDATE SET " +
                    "name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom, " +
                    "categories = EXCLUDED.categories, parent_spot_id = EXCLUDED.parent_spot_id, description = EXCLUDED.description, photo_url = EXCLUDED.photo_url " +
                    "RETURNING id";

            String description = "Area hotspot cluster for " + area.getName() + " with " + clusterPhotos.size() + " photos";
            String coverUrl = chooseDisplayUrl(clusterPhotos.get(0));

            List<UUID> ids = jdbcTemplate.query(sql,
                    (rs, rowNum) -> (UUID) rs.getObject("id"),
                    hotspotName,
                    center[0],
                    center[1],
                    center[1],
                    center[0],
                    hotspotSlug,
                    areaLandmarkId,
                    description,
                    coverUrl);

            if (!ids.isEmpty()) {
                hotspotIds.put(key, ids.get(0));
            }
        }
        return hotspotIds;
    }

    private VisionOutcome applyVisionFilteringToList(List<FlickrPhoto> photos, boolean visionEnabled) {
        if (!visionEnabled) {
            return new VisionOutcome(photos, new HashMap<>(), 0, 0, true);
        }

        Path visionScript = resolveVisionScriptPath();
        if (visionScript == null) {
            System.out.println("      ⚠️  Vision filter unavailable, skipping portrait/blur checks (script missing)");
            return new VisionOutcome(photos, new HashMap<>(), 0, 0, true);
        }

        Map<String, VisionResult> qaByPhotoKey = new HashMap<>();
        int portraitRejected = 0;
        int blurryRejected = 0;

        // Sort by views to prioritize high-quality photos for vision analysis
        List<FlickrPhoto> sorted = new ArrayList<>(photos);
        sorted.sort(Comparator.comparingInt(FlickrPhoto::getViews).reversed());

        // Analyze top candidates
        List<FlickrPhoto> candidates = sorted.subList(0, Math.min(sorted.size(), CANDIDATES_PER_HOTSPOT));
        Map<String, VisionResult> decisions = getVisionDecisions(candidates, qaByPhotoKey, visionScript);

        List<FlickrPhoto> filtered = new ArrayList<>();
        for (FlickrPhoto photo : photos) {
            String key = "flickr:" + photo.getId();
            VisionResult vr = decisions.get(key);
            if (vr != null) {
                qaByPhotoKey.put(key, vr);
                if (vr.isPortrait()) {
                    portraitRejected++;
                    continue;
                }
                if (vr.isBlurry()) {
                    blurryRejected++;
                    continue;
                }
            }
            filtered.add(photo);
        }

        return new VisionOutcome(filtered, qaByPhotoKey, portraitRejected, blurryRejected, true);
    }

    private VisionOutcome applyVisionFiltering(Map<String, List<FlickrPhoto>> clusters, boolean visionEnabled) {
        if (!visionEnabled) {
            return new VisionOutcome(clusters, new HashMap<>(), 0, 0);
        }

        Path visionScript = resolveVisionScriptPath();
        if (visionScript == null) {
            System.out.println("      ⚠️  Vision filter unavailable, skipping portrait/blur checks (script missing)");
            return new VisionOutcome(clusters, new HashMap<>(), 0, 0);
        }

        Map<String, List<FlickrPhoto>> filtered = new LinkedHashMap<>();
        Map<String, VisionResult> qaByPhotoKey = new HashMap<>();
        int portraitRejected = 0;
        int blurryRejected = 0;

        for (Map.Entry<String, List<FlickrPhoto>> entry : clusters.entrySet()) {
            List<FlickrPhoto> clusterPhotos = entry.getValue();
            List<FlickrPhoto> sorted = new ArrayList<>(clusterPhotos);
            sorted.sort(Comparator.comparingInt(FlickrPhoto::getViews).reversed());

            List<FlickrPhoto> candidates = sorted.subList(0, Math.min(sorted.size(), CANDIDATES_PER_HOTSPOT));
            Map<String, VisionResult> decisions = getVisionDecisions(candidates, qaByPhotoKey, visionScript);

            List<FlickrPhoto> kept = new ArrayList<>();
            for (FlickrPhoto photo : clusterPhotos) {
                String key = "flickr:" + photo.getId();
                VisionResult vr = decisions.get(key);
                if (vr != null) {
                    qaByPhotoKey.put(key, vr);
                    if (vr.isPortrait()) {
                        portraitRejected++;
                        continue;
                    }
                    if (vr.isBlurry()) {
                        blurryRejected++;
                        continue;
                    }
                }
                kept.add(photo);
            }

            if (!kept.isEmpty()) {
                filtered.put(entry.getKey(), kept);
            }
        }

        return new VisionOutcome(filtered, qaByPhotoKey, portraitRejected, blurryRejected);
    }

    private Map<String, VisionResult> getVisionDecisions(List<FlickrPhoto> candidates, Map<String, VisionResult> qaByPhotoKey,
                                                         Path visionScript) {
        Map<String, VisionResult> results = new HashMap<>();
        List<FlickrPhoto> toEvaluate = new ArrayList<>();

        for (FlickrPhoto photo : candidates) {
            String key = "flickr:" + photo.getId();
            VisionResult cached = getCachedVisionResult(key);
            if (cached != null) {
                results.put(key, cached);
                qaByPhotoKey.put(key, cached);
            } else {
                toEvaluate.add(photo);
            }
        }

        if (toEvaluate.isEmpty()) {
            return results;
        }

        Map<String, VisionResult> computed = runVisionScript(toEvaluate, visionScript);
        results.putAll(computed);
        qaByPhotoKey.putAll(computed);
        visionCache.putAll(computed);
        return results;
    }

    private InsertStats insertPhotosForLandmark(UUID landmarkId, List<FlickrPhoto> photos, Map<String, VisionResult> qaByPhotoKey) {
        String sql = "INSERT INTO photos (spot_id, original_key, variants, visibility) " +
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
            ") || COALESCE(?::jsonb, '{}'::jsonb), 'public') " +
            "ON CONFLICT (original_key) DO NOTHING";

        List<Object[]> batchArgs = new ArrayList<>();
        for (FlickrPhoto photo : photos) {
            String smallUrl = StringUtils.hasText(photo.getUrlS()) ? photo.getUrlS() : constructUrl(photo, "s");
            String mediumUrl = StringUtils.hasText(photo.getUrlM()) ? photo.getUrlM() :
                    (StringUtils.hasText(photo.getUrlL()) ? photo.getUrlL() : smallUrl);
            String largeUrl = StringUtils.hasText(photo.getUrlL()) ? photo.getUrlL() : mediumUrl;
            String originalUrl = largeUrl;
            String qaJson = renderQaJson(qaByPhotoKey.get("flickr:" + photo.getId()));

            batchArgs.add(new Object[]{
                    landmarkId,
                    "flickr:" + photo.getId(),
                    smallUrl,
                    mediumUrl,
                    largeUrl,
                    originalUrl,
                photo.getLatitude(),
                photo.getLongitude(),
                    photo.getOwnerName() != null ? photo.getOwnerName() : "Unknown",
                    photo.getViews(),
                photo.getTitle() != null ? photo.getTitle() : "",
                    qaJson
            });
        }

        int attempted = batchArgs.size();
        if (batchArgs.isEmpty()) {
            return new InsertStats(0, 0, 0, 0);
        }

        int inserted = 0;
        int conflicts = 0;
        int failed = 0;
        for (int start = 0; start < batchArgs.size(); start += PHOTO_BATCH_SIZE) {
            int end = Math.min(start + PHOTO_BATCH_SIZE, batchArgs.size());
            try {
                int[] results = jdbcTemplate.batchUpdate(sql, batchArgs.subList(start, end));
                for (int r : results) {
                    if (r > 0) {
                        inserted += r;
                    } else {
                        conflicts++;
                    }
                }
            } catch (DataAccessException dae) {
                failed += (end - start);
                System.out.println("      ⚠️  Insert batch failed: " + dae.getMessage());
            }
        }
        return new InsertStats(attempted, inserted, conflicts, failed);
    }

    private InsertStats insertPhotosForHotspots(Map<String, UUID> hotspotIds, Map<String, List<FlickrPhoto>> clusters,
                                        Map<String, VisionResult> qaByPhotoKey) {
        String sql = "INSERT INTO photos (spot_id, original_key, variants, visibility) " +
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
            ") || COALESCE(?::jsonb, '{}'::jsonb), 'public') " +
            "ON CONFLICT (original_key) DO NOTHING";

        List<Object[]> batchArgs = new ArrayList<>();
        for (Map.Entry<String, List<FlickrPhoto>> entry : clusters.entrySet()) {
            UUID hotspotId = hotspotIds.get(entry.getKey());
            if (hotspotId == null) {
                continue;
            }
            for (FlickrPhoto photo : entry.getValue()) {
                String smallUrl = StringUtils.hasText(photo.getUrlS()) ? photo.getUrlS() : constructUrl(photo, "s");
                String mediumUrl = StringUtils.hasText(photo.getUrlM()) ? photo.getUrlM() :
                        (StringUtils.hasText(photo.getUrlL()) ? photo.getUrlL() : smallUrl);
                String largeUrl = StringUtils.hasText(photo.getUrlL()) ? photo.getUrlL() : mediumUrl;
                String originalUrl = largeUrl;
                String qaJson = renderQaJson(qaByPhotoKey.get("flickr:" + photo.getId()));

                batchArgs.add(new Object[]{
                        hotspotId,
                        "flickr:" + photo.getId(),
                        smallUrl,
                        mediumUrl,
                        largeUrl,
                        originalUrl,
                    photo.getLatitude(),
                    photo.getLongitude(),
                        photo.getOwnerName() != null ? photo.getOwnerName() : "Unknown",
                        photo.getViews(),
                    photo.getTitle() != null ? photo.getTitle() : "",
                        qaJson
                });
            }
        }

        int attempted = batchArgs.size();
        if (batchArgs.isEmpty()) {
            return new InsertStats(0, 0, 0, 0);
        }

        int inserted = 0;
        int conflicts = 0;
        int failed = 0;
        for (int start = 0; start < batchArgs.size(); start += PHOTO_BATCH_SIZE) {
            int end = Math.min(start + PHOTO_BATCH_SIZE, batchArgs.size());
            try {
                int[] results = jdbcTemplate.batchUpdate(sql, batchArgs.subList(start, end));
                for (int r : results) {
                    if (r > 0) {
                        inserted += r;
                    } else {
                        conflicts++;
                    }
                }
            } catch (DataAccessException dae) {
                failed += (end - start);
                System.out.println("      ⚠️  Insert batch failed: " + dae.getMessage());
            }
        }
        return new InsertStats(attempted, inserted, conflicts, failed);
    }

    private VisionResult getCachedVisionResult(String originalKey) {
        if (visionCache.containsKey(originalKey)) {
            return visionCache.get(originalKey);
        }
        VisionResult persisted = loadPersistedVision(originalKey);
        if (persisted != null) {
            visionCache.put(originalKey, persisted);
        }
        return persisted;
    }

    private VisionResult loadPersistedVision(String originalKey) {
        try {
            List<String> results = jdbcTemplate.query(
                    "SELECT variants->'qa' AS qa FROM photos WHERE original_key = ?",
                    (rs, rowNum) -> rs.getString("qa"),
                    originalKey);
            if (results.isEmpty() || !StringUtils.hasText(results.get(0))) {
                return null;
            }
            JsonNode node = objectMapper.readTree(results.get(0));
            return parseVisionNode(node);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, VisionResult> runVisionScript(List<FlickrPhoto> candidates, Path visionScript) {
        Map<String, VisionResult> results = new HashMap<>();
        try {
            List<Map<String, String>> payload = new ArrayList<>();
            for (FlickrPhoto photo : candidates) {
                String url = chooseVisionUrl(photo);
                if (!StringUtils.hasText(url)) {
                    continue;
                }
                Map<String, String> item = new HashMap<>();
                item.put("id", photo.getId());
                item.put("url", url);
                payload.add(item);
            }

            if (payload.isEmpty()) {
                return results;
            }

            String inputJson = objectMapper.writeValueAsString(payload);
            ProcessBuilder pb = new ProcessBuilder("python3", visionScript.toString(), "--blur-threshold", String.valueOf(BLUR_THRESHOLD));
            pb.redirectErrorStream(true);
            Process process = pb.start();
            process.getOutputStream().write(inputJson.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().flush();
            process.getOutputStream().close();

            boolean completed = process.waitFor(PYTHON_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!completed) {
                process.destroyForcibly();
                System.out.println("      ⚠️  Vision filter timed out, falling back to metadata-only");
                return results;
            }

            String output;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                output = reader.lines().collect(Collectors.joining());
            }

            if (process.exitValue() != 0) {
                System.out.println("      ⚠️  Vision filter unavailable, skipping portrait/blur checks.");
                return results;
            }

            results.putAll(parseVisionResponse(output));
            return results;
        } catch (Exception e) {
            System.out.println("      ⚠️  Vision filter unavailable, skipping portrait/blur checks. Reason: " + e.getMessage());
            return results;
        }
    }

    private Map<String, VisionResult> parseVisionResponse(String output) {
        Map<String, VisionResult> parsed = new HashMap<>();
        try {
            JsonNode root = objectMapper.readTree(output);
            if (root == null || !root.isObject()) {
                return parsed;
            }
            root.fields().forEachRemaining(entry -> {
                VisionResult vr = parseVisionNode(entry.getValue());
                if (vr != null) {
                    parsed.put("flickr:" + entry.getKey(), vr);
                }
            });
        } catch (Exception e) {
            // ignore parsing errors and fallback to metadata-only
        }
        return parsed;
    }

    private VisionResult parseVisionNode(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        double faceMaxFrac = node.path("faceMaxFrac").asDouble(0.0);
        int faceCount = node.path("faceCount").asInt(0);
        double blurScore = node.path("blurScore").asDouble(0.0);
        boolean isPortrait = node.path("isPortrait").asBoolean(false);
        boolean isBlurry = node.path("isBlurry").asBoolean(false);
        return new VisionResult(faceMaxFrac, faceCount, blurScore, isPortrait, isBlurry);
    }

    private String chooseVisionUrl(FlickrPhoto photo) {
        if (StringUtils.hasText(photo.getUrlS())) return photo.getUrlS();
        if (StringUtils.hasText(photo.getUrlM())) return photo.getUrlM();
        if (StringUtils.hasText(photo.getUrlL())) return photo.getUrlL();
        return constructUrl(photo, "m");
    }

    private String renderQaJson(VisionResult result) {
        if (result == null) {
            return null;
        }
        try {
            Map<String, Object> qa = new HashMap<>();
            qa.put("qa", Map.of(
                    "faceMaxFrac", result.getFaceMaxFrac(),
                    "faceCount", result.getFaceCount(),
                    "blurScore", result.getBlurScore(),
                    "isPortrait", result.isPortrait(),
                    "isBlurry", result.isBlurry()
            ));
            return objectMapper.writeValueAsString(qa);
        } catch (Exception e) {
            return null;
        }
    }

    private Path resolveVisionScriptPath() {
        Path direct = Paths.get(VISION_SCRIPT);
        if (direct.toFile().exists()) {
            return direct.toAbsolutePath();
        }
        Path modulePath = Paths.get("backend-spring").resolve(VISION_SCRIPT);
        if (modulePath.toFile().exists()) {
            return modulePath.toAbsolutePath();
        }
        return null;
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

    private Map<String, List<FlickrPhoto>> clusterAreaPhotos(List<FlickrPhoto> photos) {
        Map<String, List<FlickrPhoto>> grouped = new HashMap<>();
        for (FlickrPhoto photo : photos) {
            double rLat = roundToPrecision(photo.getLatitude(), HOTSPOT_PRECISION);
            double rLng = roundToPrecision(photo.getLongitude(), HOTSPOT_PRECISION);
            String key = formattedKey(rLat, rLng);
            grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(photo);
        }

        int total = photos.size();
        int minPhotos = total < 150 ? 2 : MIN_PHOTOS_PER_HOTSPOT;

        List<ClusterCandidate> scored = new ArrayList<>();
        for (Map.Entry<String, List<FlickrPhoto>> entry : grouped.entrySet()) {
            List<FlickrPhoto> cluster = entry.getValue();
            if (cluster.size() < minPhotos) {
                continue;
            }
            double[] center = computeClusterCenter(cluster);
            long viewsSum = cluster.stream().mapToLong(p -> Math.max(p.getViews(), 0)).sum();
            Set<String> owners = cluster.stream()
                    .map(FlickrPhoto::getOwnerName)
                    .filter(StringUtils::hasText)
                    .collect(Collectors.toSet());

            double score = (cluster.size() * 1.0) + (Math.log10(viewsSum + 1) * 2.0) + (Math.min(owners.size(), 10) * 0.5);
            scored.add(new ClusterCandidate(entry.getKey(), cluster, center, score));
        }

        scored.sort(Comparator
            .comparingDouble((ClusterCandidate c) -> c.score)
            .reversed()
            .thenComparing((ClusterCandidate c) -> c.photos.size(), Comparator.reverseOrder()));

        Map<String, List<FlickrPhoto>> accepted = new LinkedHashMap<>();
        List<double[]> acceptedCenters = new ArrayList<>();
        for (ClusterCandidate candidate : scored) {
            boolean tooClose = false;
            for (double[] center : acceptedCenters) {
                double dist = haversineMeters(center[0], center[1], candidate.center[0], candidate.center[1]);
                if (dist < MIN_HOTSPOT_SEPARATION_METERS) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) {
                continue;
            }

            String key = formattedKey(candidate.center[0], candidate.center[1]);
            accepted.put(key, candidate.photos);
            acceptedCenters.add(candidate.center);
            if (accepted.size() >= MAX_HOTSPOTS_PER_AREA) {
                break;
            }
        }

        return accepted;
    }

    private Map<String, List<FlickrPhoto>> trimClusters(Map<String, List<FlickrPhoto>> clusters) {
        Map<String, List<FlickrPhoto>> trimmed = new LinkedHashMap<>();
        for (Map.Entry<String, List<FlickrPhoto>> entry : clusters.entrySet()) {
            List<FlickrPhoto> top = selectTopPhotosForHotspot(entry.getValue());
            if (!top.isEmpty()) {
                trimmed.put(entry.getKey(), top);
            }
        }
        return trimmed;
    }

    private List<FlickrPhoto> selectTopPhotosForHotspot(List<FlickrPhoto> photos) {
        List<FlickrPhoto> sorted = new ArrayList<>(photos);
        sorted.sort(Comparator
                .comparingInt(FlickrPhoto::getViews)
                .reversed()
                .thenComparing((FlickrPhoto p) -> hasLargeUrl(p) ? 0 : 1));

        List<FlickrPhoto> deduped = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (FlickrPhoto p : sorted) {
            if (p.getId() != null && !seen.contains(p.getId())) {
                seen.add(p.getId());
                deduped.add(p);
            }
        }

        int limit = Math.min(deduped.size(), MAX_PHOTOS_PER_HOTSPOT);
        return deduped.subList(0, limit);
    }

    private boolean hasLargeUrl(FlickrPhoto photo) {
        return StringUtils.hasText(photo.getUrlO()) || StringUtils.hasText(photo.getUrlL());
    }

    private String chooseDisplayUrl(FlickrPhoto photo) {
        if (StringUtils.hasText(photo.getUrlL())) return photo.getUrlL();
        if (StringUtils.hasText(photo.getUrlM())) return photo.getUrlM();
        if (StringUtils.hasText(photo.getUrlS())) return photo.getUrlS();
        if (StringUtils.hasText(photo.getUrlO())) return photo.getUrlO();
        if (StringUtils.hasText(photo.getUrlB())) return photo.getUrlB();
        if (StringUtils.hasText(photo.getUrlC())) return photo.getUrlC();
        if (StringUtils.hasText(photo.getUrlZ())) return photo.getUrlZ();
        return constructUrl(photo, "m");
    }

    private String buildLocalText(TargetLocation location) {
        String base = location.getName();
        String lower = base.toLowerCase();
        StringBuilder sb = new StringBuilder(base);

        if (!lower.contains("toronto")) {
            sb.append(" Toronto");
        }
        if (!lower.contains("ontario")) {
            sb.append(" Ontario");
        }
        return sb.toString().trim();
    }

    private List<TargetLocation> buildTiles(AreaConfig area) {
        double metersPerDegLat = 111320.0;
        double metersPerDegLng = 111320.0 * Math.cos(Math.toRadians(area.getLat()));
        double radiusMeters = area.getRadiusKm() * 1000.0;
        double spacing = area.getTileSpacingMeters();

        List<TargetLocation> tiles = new ArrayList<>();
        for (double dy = -radiusMeters; dy <= radiusMeters; dy += spacing) {
            for (double dx = -radiusMeters; dx <= radiusMeters; dx += spacing) {
                double dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radiusMeters) {
                    continue;
                }
                double lat = area.getLat() + (dy / metersPerDegLat);
                double lng = area.getLng() + (dx / metersPerDegLng);
                String name = area.getName() + " tile " + (tiles.size() + 1);
                tiles.add(new TargetLocation(name, lat, lng, area.getTileRadiusKm()));
            }
        }

        if (tiles.size() > 60) {
            tiles.sort(Comparator.comparingDouble(t -> haversineMeters(area.getLat(), area.getLng(), t.getLatitude(), t.getLongitude())));
            tiles = new ArrayList<>(tiles.subList(0, 60));
            System.out.println("   ⚠️  Tile count capped at 60 (consider increasing spacing)");
        }

        return tiles;
    }

    private Set<String> buildLocationTokens(TargetLocation location) {
        Set<String> tokens = new HashSet<>(BASE_LOCATION_TOKENS);
        tokens.addAll(tokenize(location.getName()));
        if (location.getAlternateNames() != null) {
            for (String alt : location.getAlternateNames()) {
                tokens.addAll(tokenize(alt));
            }
        }
        return tokens;
    }

    private boolean isSuspectSubject(FlickrPhoto photo, Set<String> locationTokens) {
        Set<String> tokens = new HashSet<>();
        tokens.addAll(tokenize(photo.getTitle()));
        tokens.addAll(tokenize(photo.getTags()));
        boolean hasSuspect = tokens.stream().anyMatch(SUSPECT_TOKENS::contains);
        if (!hasSuspect) {
            return false;
        }
        boolean hasLocationToken = tokens.stream().anyMatch(locationTokens::contains);
        return !hasLocationToken;
    }

    private Set<String> tokenize(String text) {
        Set<String> tokens = new HashSet<>();
        if (!StringUtils.hasText(text)) {
            return tokens;
        }
        String[] parts = text.toLowerCase().split("[^a-z0-9]+");
        for (String part : parts) {
            if (StringUtils.hasText(part)) {
                tokens.add(part);
            }
        }
        return tokens;
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
            return true; // only GTA clamp applies when we lack a point target
        }
        double radiusKm = Math.max(location.getRadiusKm(), DEFAULT_RADIUS_METERS / 1000.0);
        double radiusMeters = radiusKm * 1000.0 * RADIUS_MARGIN;
        double distance = haversineMeters(location.getLatitude(), location.getLongitude(), photo.getLatitude(), photo.getLongitude());
        return distance <= radiusMeters;
    }

    private List<FlickrPhoto> clampToGtaAndRadius(TargetLocation location, List<FlickrPhoto> photos, FetchCounters counters) {
        counters.fetched += photos.size();
        List<FlickrPhoto> gtaKept = new ArrayList<>();
        for (FlickrPhoto p : photos) {
            if (!p.hasValidGeo()) {
                counters.missingGeo++;
                continue;
            }
            if (!isWithinGta(p.getLatitude(), p.getLongitude())) {
                counters.outsideGta++;
                continue;
            }
            gtaKept.add(p);
        }

        logDistanceStats(location, gtaKept);

        List<FlickrPhoto> kept = new ArrayList<>();
        for (FlickrPhoto p : gtaKept) {
            if (!isWithinTargetRadius(location, p)) {
                counters.outsideRadius++;
                continue;
            }
            kept.add(p);
        }

        counters.kept += kept.size();
        return kept;
    }

    private void logDistanceStats(TargetLocation location, List<FlickrPhoto> gtaKept) {
        if (!location.hasCoordinates() || gtaKept.isEmpty()) {
            return;
        }
        double minDistance = Double.MAX_VALUE;
        int within500 = 0;
        int within1000 = 0;
        int within2000 = 0;

        for (FlickrPhoto p : gtaKept) {
            double dist = haversineMeters(location.getLatitude(), location.getLongitude(), p.getLatitude(), p.getLongitude());
            minDistance = Math.min(minDistance, dist);
            if (dist <= 500) within500++;
            if (dist <= 1000) within1000++;
            if (dist <= 2000) within2000++;
        }

        if (minDistance < Double.MAX_VALUE) {
            System.out.println("         📏 Distance stats: min=" + Math.round(minDistance) + "m; <=500m:" + within500 +
                    "; <=1km:" + within1000 + "; <=2km:" + within2000);
        }
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
