package com.photospots.service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Statement;
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
        private final int successNoInfo;

        private InsertStats(int attempted, int inserted, int conflicts, int failed, int successNoInfo) {
            this.attempted = attempted;
            this.inserted = inserted;
            this.conflicts = conflicts;
            this.failed = failed;
            this.successNoInfo = successNoInfo;
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
    private static class GeoSearchResult {
        final List<FlickrPhoto> photos;
        final String timeWindow;

        GeoSearchResult(List<FlickrPhoto> photos, String timeWindow) {
            this.photos = photos;
            this.timeWindow = timeWindow;
        }
    }
    private static final String FLICKR_API_BASE = "https://api.flickr.com/services/rest/";
    private static final String EXTRAS = "url_s,url_m,url_l,url_o,geo,owner_name,views,tags,o_dims,date_upload";
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
        // Tag buckets for geo-first discovery
        private static final String[] STREET_ART_BUCKET = {"streetart", "graffiti", "mural", "urbanart"};
        private static final String[] ARCHITECTURE_BUCKET = {"architecture", "building", "cityscape", "brutalism"};
        private static final String[] NIGHT_VIBE_BUCKET = {"night", "lights", "neon", "nocturne", "longexposure"};
        private static final String[] NATURE_PARK_BUCKET = {"trail", "ravine", "creek", "woods", "marsh", "sunset"};
        private static final String[] SEASONAL_BUCKET = {"holiday", "christmas", "halloween", "autumn", "fallcolors"};
        
        private static final String[][] ALL_BUCKETS = {STREET_ART_BUCKET, ARCHITECTURE_BUCKET, NIGHT_VIBE_BUCKET, NATURE_PARK_BUCKET, SEASONAL_BUCKET};
        
        // Nature-related keywords for bucket selection
        private static final Set<String> NATURE_KEYWORDS = Set.of("park", "trail", "ravine", "beach", "garden", "woods", "forest", "creek", "valley", "pond", "lake");
        // Geo-first search limits
        private static final int MAX_BUCKETS_PER_ATTEMPT = 2;
        
        private static final int MIN_KEEP_FOR_TIME_WIDEN = 15;
        // Time window ladder (unix seconds)
        private static final long SECONDS_PER_YEAR = 365L * 24 * 60 * 60;
        private static final long TIME_WINDOW_RECENT = 1 * SECONDS_PER_YEAR;  // last 12 months
        
        private static final long TIME_WINDOW_MID = 5 * SECONDS_PER_YEAR;     // last 5 years
        // Diversity caps
        private static final int MAX_PER_OWNER_LANDMARK = 10;
        private static final int MAX_PER_OWNER_AREA = 6;
        
        private static final int MAX_PER_COORD_BIN = 8;

            private static final String[] EXCLUDE_TOKENS = new String[]{
                "selfie", "portrait", "headshot", "model", "fashion", "wedding", "engagement",
                "bird", "birds", "wildlife", "owl", "hawk", "eagle", "duck", "goose", "dog", "puppy", "cat", "kitten",
                "food", "meal", "dinner", "lunch", "coffee",
                "protest", "rally", "march", "demonstration", "crowd", "police", "riot", "election", "campaign",
                "flag", "banner", "placard", "chant",
                "festival", "event", "parade", "people"
            };
        private static final Set<String> SUSPECT_TOKENS = Set.of(EXCLUDE_TOKENS);
        private static final Set<String> EVENT_TOKENS = Set.of(
                "protest", "rally", "march", "demonstration", "crowd", "police", "riot", "election", "campaign",
                "flag", "banner", "placard", "chant", "festival", "event", "parade", "people"
        );
        /** Meters beyond which a photo must have at least one location token (title/tags) to be kept. */
        private static final double MAX_DISTANCE_METERS_NO_TOKEN = 400.0;
        /** Event/crowd photos are only allowed if very close and strongly tagged to the landmark. */
        private static final double MAX_EVENT_DISTANCE_METERS = 200.0;
        private static final Set<String> BASE_LOCATION_TOKENS = Set.of("toronto", "ontario", "canada");
        private static final int CANDIDATES_PER_HOTSPOT = 120;
        private static final int BLUR_THRESHOLD = 60;

        private static final int PYTHON_TIMEOUT_SECONDS = 45;

        private static final String VISION_SCRIPT = Paths.get("tools", "photo_filter", "filter_photos.py").toString();

        // Place ID cache (rounded to 2 decimals)
        private final Map<String, String> placeIdCache = new HashMap<>();
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
        
        // Coordinate validation guardrail
        if (location.hasCoordinates()) {
            System.out.println("      ✅ Coordinates: lat=" + location.getLatitude() + ", lng=" + location.getLongitude());
        } else {
            System.out.println("      ⚠️  WARNING: No coordinates available! Will fall back to GTA bbox discovery.");
            System.out.println("         This may produce incorrect landmark centers. Check JSON deserialization.");
        }

        // Respect each landmark's configured radius; expand only if results are empty (max 2km cap).
        double r = location.getRadiusKm();
        double[] radiusAttempts = new double[]{
            r,                                    // Attempt 1: location.radiusKm (e.g. 0.4 for Distillery)
            Math.max(r * 2, 0.6),                 // Attempt 2: 2x or at least 0.6km
            Math.min(r * 4, 2.0)                  // Attempt 3: 4x but cap at 2.0km; stop there
        };

        Set<String> seenPhotoIds = new HashSet<>();
        List<FlickrPhoto> allPhotos = new ArrayList<>();
        int duplicateCount = 0;
        FilterOutcome filtered = null;
        UpsertOutcome outcome = null;
        int totalFetched = 0;

        // Resolve place_id once for name-first searches (collision killer)
        String placeId = null;
        if (location.hasCoordinates()) {
            placeId = resolvePlaceIdForLatLon(apiKey, location.getLatitude(), location.getLongitude());
            rateLimitDelay();
        }

        // Select tag buckets for this landmark
        String[][] selectedBuckets = selectBucketsForLandmark(location);

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
            int callCount = 0;
            FetchCounters counters = new FetchCounters();

            // ==================== NAME-FIRST ANCHORS (with place scoping) ====================
            System.out.println("      🔍 [NAME-FIRST] Searching by relevance" + (placeId != null ? " (place_id scoped)" : "") + "...");
            List<FlickrPhoto> relevancePhotos = clampToGtaAndRadius(attemptLocation, 
                    searchPhotosWithPlaceScope(apiKey, attemptLocation, "relevance", placeId), counters);
            int relevanceCount = addUniquePhotos(relevancePhotos, allPhotos, seenPhotoIds);
            duplicateCount += Math.max(0, relevancePhotos.size() - relevanceCount);
            logStrategy("name-relevance", counters, relevancePhotos.size(), relevanceCount, relevancePhotos.size() - relevanceCount);
            rateLimitDelay();
            callCount++;

            System.out.println("      ⭐ [NAME-FIRST] Searching by interestingness" + (placeId != null ? " (place_id scoped)" : "") + "...");
            List<FlickrPhoto> interestingPhotos = clampToGtaAndRadius(attemptLocation, 
                    searchPhotosWithPlaceScope(apiKey, attemptLocation, "interestingness-desc", placeId), counters);
            int interestingCount = addUniquePhotos(interestingPhotos, allPhotos, seenPhotoIds);
            duplicateCount += Math.max(0, interestingPhotos.size() - interestingCount);
            logStrategy("name-interesting", counters, interestingPhotos.size(), interestingCount, interestingPhotos.size() - interestingCount);
            rateLimitDelay();
            callCount++;

            // Cap alt-name searches to 1 when geo-first is enabled (to stay under 6 calls)
            if (attemptLocation.getAlternateNames() != null && attemptLocation.getAlternateNames().length > 0) {
                String altName = attemptLocation.getAlternateNames()[0];
                System.out.println("      🔄 [NAME-FIRST] Searching alternate name: " + altName);
                TargetLocation altLocation = new TargetLocation(altName,
                        attemptLocation.getLatitude(), attemptLocation.getLongitude(), attemptLocation.getRadiusKm());
                List<FlickrPhoto> altPhotos = clampToGtaAndRadius(attemptLocation, 
                        searchPhotosWithPlaceScope(apiKey, altLocation, "relevance", placeId), counters);
                int altCount = addUniquePhotos(altPhotos, allPhotos, seenPhotoIds);
                duplicateCount += Math.max(0, altPhotos.size() - altCount);
                logStrategy("alt-name", counters, altPhotos.size(), altCount, altPhotos.size() - altCount);
                rateLimitDelay();
                callCount++;
            }

            // ==================== GEO-FIRST DISCOVERY (no text) ====================
            // For dense downtown (small radius), skip raw geo-interestingness to avoid event/crowd collateral.
            // Use only name-first + bucket (STREET_ART, NIGHT_VIBE, etc.) for these landmarks.
            boolean skipRawGeoInteresting = location.getRadiusKm() <= 0.5;
            if (callCount < 6 && !skipRawGeoInteresting) {
                System.out.println("      🌍 [GEO-FIRST] Interestingness search (no text, time-window ladder)...");
                GeoSearchResult geoInteresting = runGeoInterestingnessWithTimeLadder(apiKey, attemptLocation, counters);
                int geoIntCount = addUniquePhotos(geoInteresting.photos, allPhotos, seenPhotoIds);
                duplicateCount += Math.max(0, geoInteresting.photos.size() - geoIntCount);
                logStrategy("geo-interesting[" + geoInteresting.timeWindow + "]", counters, geoInteresting.photos.size(), geoIntCount, geoInteresting.photos.size() - geoIntCount);
                rateLimitDelay();
                callCount++;
            } else if (skipRawGeoInteresting && callCount < 6) {
                System.out.println("      🌍 [GEO-FIRST] Skipping raw geo-interesting (dense downtown radius " + location.getRadiusKm() + "km); using buckets only.");
            }

            // Run up to MAX_BUCKETS_PER_ATTEMPT bucket searches if we have room
            int bucketsRun = 0;
            for (String[] bucket : selectedBuckets) {
                if (callCount >= 6 || bucketsRun >= MAX_BUCKETS_PER_ATTEMPT) {
                    break;
                }
                String bucketName = bucket[0]; // use first tag as bucket name for logging
                System.out.println("      🏷️ [GEO-FIRST] Tag bucket search: " + bucketName + " (time-window ladder)...");
                GeoSearchResult bucketResult = runGeoTagBucketWithTimeLadder(apiKey, attemptLocation, bucket, counters);
                int bucketCount = addUniquePhotos(bucketResult.photos, allPhotos, seenPhotoIds);
                duplicateCount += Math.max(0, bucketResult.photos.size() - bucketCount);
                logStrategy("geo-bucket[" + bucketName + "," + bucketResult.timeWindow + "]", counters, bucketResult.photos.size(), bucketCount, bucketResult.photos.size() - bucketCount);
                rateLimitDelay();
                callCount++;
                bucketsRun++;
            }

            System.out.println("      📊 Total API calls this attempt: " + callCount);

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

            // Apply diversity pruning before insert
            System.out.println("      🎯 Applying diversity pruning (max " + MAX_PER_OWNER_LANDMARK + " per owner)...");
            List<FlickrPhoto> diversePhotos = applyDiversityPruning(filtered.qualityPhotos, MAX_PER_OWNER_LANDMARK);
            diversePhotos = ensureTagVariety(diversePhotos, 10);
            System.out.println("         After diversity pruning: " + diversePhotos.size() + " photos (from " + filtered.qualityPhotos.size() + ")");

            System.out.println("      💾 Upserting landmark and photos...");
            outcome = upsertLocationHierarchy(attemptLocation, diversePhotos, visionEnabled);
            int failedInsert = outcome.failedPhotoInserts;
            System.out.println("      🧠 Vision rejections — portraits: " + outcome.portraitRejects + ", blurry: " + outcome.blurryRejects);
            System.out.println("      📊 Counts — filtered:" + diversePhotos.size() +
                    " attempted:" + outcome.photosAttempted +
                    " inserted:" + outcome.photosInserted +
                    " conflict-skipped:" + outcome.conflictSkipped +
                    " failed:" + outcome.failedPhotoInserts);
            System.out.println("      ✅ Inserted/updated " + outcome.photosInserted + " photos for " + attemptLocation.getName());

            return new SeedResult(
                    attemptLocation.getName(),
                    totalFetched,
                    diversePhotos.size(),
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
            int tileCallCount = 0;

            // Query A: geo-only interestingness with time-window ladder (no text)
            System.out.println("      🌍 [GEO-FIRST] Interestingness (time-window ladder)...");
            GeoSearchResult geoInteresting = runGeoInterestingnessWithTimeLadder(apiKey, tile, counters);
            tileFetchedTotal += counters.fetched;
            tileRadiusKeptTotal += geoInteresting.photos.size();
            int interestingAdded = addUniquePhotos(geoInteresting.photos, tilePhotos, seenPhotoIds);
            tileUniqueAdded += interestingAdded;
            duplicateCount += Math.max(0, geoInteresting.photos.size() - interestingAdded);
            logStrategy("geo-interesting[" + geoInteresting.timeWindow + "]", counters, geoInteresting.photos.size(), interestingAdded, geoInteresting.photos.size() - interestingAdded);
            rateLimitDelay();
            tileCallCount++;

            // Query B: deterministic bucket rotation based on tile index (1-2 bucket searches)
            String[] bucket1 = selectBucketForTile(tileIdx - 1);
            String bucket1Name = bucket1[0];
            System.out.println("      🏷️ [GEO-FIRST] Tag bucket: " + bucket1Name + " (tile rotation)...");
            GeoSearchResult bucketResult1 = runGeoTagBucketWithTimeLadder(apiKey, tile, bucket1, counters);
            tileFetchedTotal += counters.fetched;
            tileRadiusKeptTotal += bucketResult1.photos.size();
            int bucket1Added = addUniquePhotos(bucketResult1.photos, tilePhotos, seenPhotoIds);
            tileUniqueAdded += bucket1Added;
            duplicateCount += Math.max(0, bucketResult1.photos.size() - bucket1Added);
            logStrategy("geo-bucket[" + bucket1Name + "," + bucketResult1.timeWindow + "]", counters, bucketResult1.photos.size(), bucket1Added, bucketResult1.photos.size() - bucket1Added);
            rateLimitDelay();
            tileCallCount++;

            // Optional second bucket (keep under 3 calls per tile)
            if (tileCallCount < 3) {
                String[] bucket2 = selectBucketForTile(tileIdx + ALL_BUCKETS.length / 2);
                if (!bucket2[0].equals(bucket1[0])) {
                    String bucket2Name = bucket2[0];
                    System.out.println("      🏷️ [GEO-FIRST] Tag bucket: " + bucket2Name + " (second bucket)...");
                    GeoSearchResult bucketResult2 = runGeoTagBucketWithTimeLadder(apiKey, tile, bucket2, counters);
                    tileFetchedTotal += counters.fetched;
                    tileRadiusKeptTotal += bucketResult2.photos.size();
                    int bucket2Added = addUniquePhotos(bucketResult2.photos, tilePhotos, seenPhotoIds);
                    tileUniqueAdded += bucket2Added;
                    duplicateCount += Math.max(0, bucketResult2.photos.size() - bucket2Added);
                    logStrategy("geo-bucket[" + bucket2Name + "," + bucketResult2.timeWindow + "]", counters, bucketResult2.photos.size(), bucket2Added, bucketResult2.photos.size() - bucket2Added);
                    rateLimitDelay();
                    tileCallCount++;
                }
            }

            System.out.println("      📊 Tile API calls: " + tileCallCount);

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

        // Apply diversity pruning for areas
        System.out.println("   🎯 Applying diversity pruning (max " + MAX_PER_OWNER_AREA + " per owner)...");
        List<FlickrPhoto> diversePhotos = applyDiversityPruning(allFiltered, MAX_PER_OWNER_AREA);
        diversePhotos = ensureTagVariety(diversePhotos, 20);
        System.out.println("      After diversity pruning: " + diversePhotos.size() + " photos (from " + allFiltered.size() + ")");

        // Cluster photos into individual photo spots (nameless niche discoveries)
        System.out.println("   📍 Clustering photos into photo spots...");
        Map<String, List<FlickrPhoto>> clusters = clusterAreaPhotos(diversePhotos);
        System.out.println("      Found " + clusters.size() + " photo spot clusters (min " + 
                           (diversePhotos.size() < 150 ? 2 : MIN_PHOTOS_PER_HOTSPOT) + " photos per cluster)");

        int photospotUpserts = 0;
        int totalInserted = 0;
        int totalAttempted = 0;
        int totalConflicts = 0;
        int totalFailed = 0;
        int totalPortraitRejected = 0;
        int totalBlurryRejected = 0;

        if (clusters.isEmpty()) {
            System.out.println("      ⚠️  No clusters formed (photos too dispersed or insufficient per location)");
        } else {
            // Create nameless photo spots and insert photos for each cluster
            Map<String, UUID> photospotIds = upsertPhotoSpots(area, clusters);
            photospotUpserts = photospotIds.size();
            System.out.println("      ✅ Created " + photospotUpserts + " photo spots");

            int clusterIdx = 0;
            for (Map.Entry<String, UUID> entry : photospotIds.entrySet()) {
                clusterIdx++;
                String clusterKey = entry.getKey();
                UUID photospotId = entry.getValue();
                List<FlickrPhoto> clusterPhotos = clusters.get(clusterKey);

                // Apply vision filtering to cluster photos
                VisionOutcome clusterVision = applyVisionFilteringToList(clusterPhotos, visionEnabled);
                InsertStats clusterStats = insertPhotosForLandmark(photospotId, clusterVision.filteredPhotos, clusterVision.qaByPhotoKey);

                totalInserted += clusterStats.inserted;
                totalAttempted += clusterStats.attempted;
                totalConflicts += clusterStats.conflicts;
                totalFailed += clusterStats.failed;
                totalPortraitRejected += clusterVision.portraitRejected;
                totalBlurryRejected += clusterVision.blurryRejected;

                System.out.println("         Photo spot " + clusterIdx + "/" + photospotUpserts + ": " + 
                                   clusterStats.inserted + " photos inserted (from " + clusterPhotos.size() + " candidates)");
            }
        }

        System.out.println("   📈 Area summary — total clusters:" + clusters.size() +
            " photo spots created:" + photospotUpserts);
        System.out.println("   🧠 Vision rejections — portraits: " + totalPortraitRejected + ", blurry: " + totalBlurryRejected);
        System.out.println("   ✅ Area complete — " +
                " attempted:" + totalAttempted +
                " inserted:" + totalInserted +
                " conflict-skipped:" + totalConflicts +
                " failed:" + totalFailed);

        return new SeedResult(area.getName(), totalFetched, diversePhotos.size(), totalInserted, 0,
                photospotUpserts, totalMissingGeo, totalMissingUrl, duplicateCount, totalConflicts, totalFailed, totalAttempted);
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

        Set<String> strongLocationTokens = buildStrongLocationTokens(location);

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
            Set<String> photoTokens = new HashSet<>();
            photoTokens.addAll(tokenize(photo.getTitle()));
            photoTokens.addAll(tokenize(photo.getTags()));

            if (isSuspectSubject(photoTokens, strongLocationTokens)) {
                suspectRejects++;
                continue;
            }
            // Distance-gated relevance: if photo is far from landmark, require at least one location token
            if (location.hasCoordinates()) {
                double distanceMeters = haversineMeters(
                    location.getLatitude(), location.getLongitude(),
                    photo.getLatitude(), photo.getLongitude());
                if (distanceMeters > MAX_DISTANCE_METERS_NO_TOKEN) {
                    boolean hasStrongLocationToken = photoTokens.stream().anyMatch(strongLocationTokens::contains);
                    if (!hasStrongLocationToken) {
                        suspectRejects++;
                        continue;
                    }
                }
                // Reject event/crowd photos unless they're very close and strongly tagged to the landmark.
                boolean hasEventToken = photoTokens.stream().anyMatch(EVENT_TOKENS::contains);
                if (hasEventToken) {
                    boolean hasStrongLocationToken = photoTokens.stream().anyMatch(strongLocationTokens::contains);
                    boolean isDenseDowntown = location.getRadiusKm() <= 0.5;
                    if (!hasStrongLocationToken || distanceMeters > MAX_EVENT_DISTANCE_METERS || isDenseDowntown) {
                        suspectRejects++;
                        continue;
                    }
                }
            }
            filtered.add(photo);
        }

        return new FilterOutcome(filtered, missingGeo, missingUrl, 0, suspectRejects);
    }

    @Transactional
    private UpsertOutcome upsertLocationHierarchy(TargetLocation location, List<FlickrPhoto> qualityPhotos, boolean visionEnabled) {
        String placeSlug = slugify(location.getName());
        double[] center = determineCenter(location, qualityPhotos);
        FlickrPhoto coverPhoto = selectCoverPhoto(location, qualityPhotos);
        String coverUrl = chooseDisplayUrl(coverPhoto != null ? coverPhoto : qualityPhotos.get(0));

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

    /**
     * Create nameless photo spots for discovered niche locations.
     * These spots have no name (null) and use category 'photospot' to differentiate
     * them from named landmarks. The photo_url serves as the marker image.
     */
    private Map<String, UUID> upsertPhotoSpots(AreaConfig area, Map<String, List<FlickrPhoto>> clusters) {
        Map<String, UUID> photospotIds = new HashMap<>();
        for (Map.Entry<String, List<FlickrPhoto>> entry : clusters.entrySet()) {
            String key = entry.getKey();
            List<FlickrPhoto> clusterPhotos = entry.getValue();
            double[] center = computeClusterCenter(clusterPhotos);
            String photospotSlug = String.format("photospot:%s:%s", area.getKey(), key);

            // Create spot with NULL name - this is intentional for niche discoveries
            String sql = "INSERT INTO spots (name, lat, lng, geom, source, source_id, categories, description, photo_url) " +
                    "VALUES (NULL, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), 'flickr', ?, ARRAY['photospot'], ?, ?) " +
                    "ON CONFLICT (source, source_id) DO UPDATE SET " +
                    "lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom, " +
                    "categories = EXCLUDED.categories, description = EXCLUDED.description, photo_url = EXCLUDED.photo_url " +
                    "RETURNING id";

            String coverUrl = chooseDisplayUrl(clusterPhotos.get(0));

            List<UUID> ids = jdbcTemplate.query(sql,
                    (rs, rowNum) -> (UUID) rs.getObject("id"),
                    center[0],
                    center[1],
                    center[1],
                    center[0],
                    photospotSlug,
                    clusterPhotos.size() + " photos",
                    coverUrl);

            if (!ids.isEmpty()) {
                photospotIds.put(key, ids.get(0));
            }
        }
        return photospotIds;
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
            ") || COALESCE(?::jsonb, '{}'::jsonb), 'public', ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)) " +
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
                    ,
                    photo.getLatitude(),
                    photo.getLongitude(),
                    photo.getLongitude(),
                    photo.getLatitude()
            });
        }

        int attempted = batchArgs.size();
        if (batchArgs.isEmpty()) {
            return new InsertStats(0, 0, 0, 0, 0);
        }

        int inserted = 0;
        int conflicts = 0;
        int failed = 0;
        int successNoInfo = 0;
        for (int start = 0; start < batchArgs.size(); start += PHOTO_BATCH_SIZE) {
            int end = Math.min(start + PHOTO_BATCH_SIZE, batchArgs.size());
            try {
                int[] results = jdbcTemplate.batchUpdate(sql, batchArgs.subList(start, end));
                for (int r : results) {
                    if (r == Statement.SUCCESS_NO_INFO) {
                        // Postgres JDBC can return SUCCESS_NO_INFO for successful batched writes.
                        successNoInfo++;
                        inserted++;
                    } else if (r > 0) {
                        inserted += r;
                    } else if (r == Statement.EXECUTE_FAILED) {
                        failed++;
                    } else {
                        conflicts++;
                    }
                }
            } catch (DataAccessException dae) {
                failed += (end - start);
                System.out.println("      ⚠️  Insert batch failed: " + dae.getMessage());
            }
        }
        if (successNoInfo > 0) {
            System.out.println("      ℹ️  Insert stats: " + successNoInfo + " writes returned SUCCESS_NO_INFO (counted as inserted).");
        }
        backfillPhotoGeoForSpot(landmarkId);
        return new InsertStats(attempted, inserted, conflicts, failed, successNoInfo);
    }

    private InsertStats insertPhotosForHotspots(Map<String, UUID> hotspotIds, Map<String, List<FlickrPhoto>> clusters,
                                        Map<String, VisionResult> qaByPhotoKey) {
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
            ") || COALESCE(?::jsonb, '{}'::jsonb), 'public', ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)) " +
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
                        ,
                        photo.getLatitude(),
                        photo.getLongitude(),
                        photo.getLongitude(),
                        photo.getLatitude()
                });
            }
        }

        int attempted = batchArgs.size();
        if (batchArgs.isEmpty()) {
            return new InsertStats(0, 0, 0, 0, 0);
        }

        int inserted = 0;
        int conflicts = 0;
        int failed = 0;
        int successNoInfo = 0;
        for (int start = 0; start < batchArgs.size(); start += PHOTO_BATCH_SIZE) {
            int end = Math.min(start + PHOTO_BATCH_SIZE, batchArgs.size());
            try {
                int[] results = jdbcTemplate.batchUpdate(sql, batchArgs.subList(start, end));
                for (int r : results) {
                    if (r == Statement.SUCCESS_NO_INFO) {
                        successNoInfo++;
                        inserted++;
                    } else if (r > 0) {
                        inserted += r;
                    } else if (r == Statement.EXECUTE_FAILED) {
                        failed++;
                    } else {
                        conflicts++;
                    }
                }
            } catch (DataAccessException dae) {
                failed += (end - start);
                System.out.println("      ⚠️  Insert batch failed: " + dae.getMessage());
            }
        }
        if (successNoInfo > 0) {
            System.out.println("      ℹ️  Insert stats: " + successNoInfo + " writes returned SUCCESS_NO_INFO (counted as inserted).");
        }
        for (UUID hotspotId : hotspotIds.values()) {
            backfillPhotoGeoForSpot(hotspotId);
        }
        return new InsertStats(attempted, inserted, conflicts, failed, successNoInfo);
    }

    private void backfillPhotoGeoForSpot(UUID spotId) {
        try {
            // Use jsonb_exists() so JDBC does not treat PostgreSQL's ? operator as a bind placeholder
            String sql = "UPDATE photos SET " +
                "lat = COALESCE(lat, (variants->>'latitude')::double precision), " +
                "lng = COALESCE(lng, (variants->>'longitude')::double precision), " +
                "geom = COALESCE(geom, ST_SetSRID(ST_MakePoint((variants->>'longitude')::double precision, (variants->>'latitude')::double precision), 4326)) " +
                "WHERE spot_id = ? AND (lat IS NULL OR lng IS NULL OR geom IS NULL) " +
                "AND jsonb_exists(variants, 'latitude') AND jsonb_exists(variants, 'longitude')";
            int updated = jdbcTemplate.update(sql, spotId);
            if (updated > 0) {
                System.out.println("      🧭 Backfilled geo columns for " + updated + " photos (spot_id=" + spotId + ")");
            }
        } catch (Exception e) {
            System.out.println("      ⚠️  Geo backfill skipped (spot_id=" + spotId + "): " + e.getMessage());
        }
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
        tokens.addAll(buildStrongLocationTokens(location));
        return tokens;
    }

    private Set<String> buildStrongLocationTokens(TargetLocation location) {
        Set<String> tokens = new HashSet<>();
        tokens.addAll(tokenize(location.getName()));
        if (location.getAlternateNames() != null) {
            for (String alt : location.getAlternateNames()) {
                tokens.addAll(tokenize(alt));
            }
        }
        return tokens;
    }

    private boolean isSuspectSubject(Set<String> photoTokens, Set<String> strongLocationTokens) {
        Set<String> tokens = new HashSet<>();
        tokens.addAll(photoTokens);
        boolean hasSuspect = tokens.stream().anyMatch(SUSPECT_TOKENS::contains);
        if (!hasSuspect) {
            return false;
        }
        boolean hasStrongLocationToken = tokens.stream().anyMatch(strongLocationTokens::contains);
        return !hasStrongLocationToken;
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

    private boolean hasAnyTag(FlickrPhoto photo, Set<String> tagSet) {
        Set<String> t = new HashSet<>();
        t.addAll(tokenize(photo.getTitle()));
        t.addAll(tokenize(photo.getTags()));
        return t.stream().anyMatch(tagSet::contains);
    }

    /** Approximate pixel count for preferred resolution ordering (larger preferred). */
    private long effectivePixelCount(FlickrPhoto photo) {
        if (photo.getWidthO() > 0 && photo.getHeightO() > 0) {
            return (long) photo.getWidthO() * (long) photo.getHeightO();
        }
        if (photo.getWidthL() > 0 && photo.getHeightL() > 0) {
            return (long) photo.getWidthL() * (long) photo.getHeightL();
        }
        return 0;
    }

    /**
     * Pick a cover photo that represents the landmark (not a one-off event).
     * Preference order:
     * 1) Strong landmark token present AND no event/crowd tokens
     * 2) Strong landmark token present (even if event/crowd)
     * 3) Any photo (fallback)
     * Within a tier, prefer closer distance, higher views, higher resolution.
     */
    private FlickrPhoto selectCoverPhoto(TargetLocation location, List<FlickrPhoto> photos) {
        if (photos == null || photos.isEmpty()) {
            return null;
        }
        Set<String> strongLocationTokens = buildStrongLocationTokens(location);

        List<FlickrPhoto> tier1 = new ArrayList<>();
        List<FlickrPhoto> tier2 = new ArrayList<>();
        List<FlickrPhoto> tier3 = new ArrayList<>();

        for (FlickrPhoto photo : photos) {
            Set<String> tokens = new HashSet<>();
            tokens.addAll(tokenize(photo.getTitle()));
            tokens.addAll(tokenize(photo.getTags()));

            boolean hasStrongLocationToken = tokens.stream().anyMatch(strongLocationTokens::contains);
            boolean hasEventToken = tokens.stream().anyMatch(EVENT_TOKENS::contains);

            if (hasStrongLocationToken && !hasEventToken) {
                tier1.add(photo);
            } else if (hasStrongLocationToken) {
                tier2.add(photo);
            } else {
                tier3.add(photo);
            }
        }

        List<FlickrPhoto> candidates = !tier1.isEmpty() ? tier1 : (!tier2.isEmpty() ? tier2 : tier3);
        candidates.sort(Comparator
                .comparingDouble((FlickrPhoto p) -> location.hasCoordinates()
                        ? haversineMeters(location.getLatitude(), location.getLongitude(), p.getLatitude(), p.getLongitude())
                        : 0.0)
                .thenComparingInt(FlickrPhoto::getViews).reversed()
                .thenComparingLong((FlickrPhoto p) -> effectivePixelCount(p)).reversed()
                .thenComparingLong(FlickrPhoto::getDateUpload).reversed()
                .thenComparing(FlickrPhoto::getId));

        return candidates.get(0);
    }

    private double[] determineCenter(TargetLocation location, List<FlickrPhoto> photos) {
        if (location.hasCoordinates()) {
            double lat = location.getLatitude();
            double lng = location.getLongitude();
            System.out.println("      🎯 determineCenter() USING TARGET COORDS: [" + lat + ", " + lng + "]");
            return new double[]{lat, lng};
        }
        double lat = 0;
        double lng = 0;
        for (FlickrPhoto photo : photos) {
            lat += photo.getLatitude();
            lng += photo.getLongitude();
        }
        double avgLat = lat / photos.size();
        double avgLng = lng / photos.size();
        System.out.println("      ⚠️  determineCenter() USING PHOTO CENTROID: [" + avgLat + ", " + avgLng + "] from " + photos.size() + " photos");
        return new double[]{avgLat, avgLng};
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

    // ==================== GEO-FIRST DISCOVERY HELPERS ====================

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

    /**
     * Search by geo location and interestingness with optional time window.
     * No text= parameter - purely location-based discovery.
     */
    private List<FlickrPhoto> searchPhotosGeoWithTimeWindow(String apiKey, TargetLocation location, String sortOrder, Long minUploadDate) {
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

            if (minUploadDate != null) {
                url.append("&min_upload_date=").append(minUploadDate);
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
                return new ArrayList<>();
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error in geo time-window search: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * Search by geo location and tags with optional time window.
     * No text= parameter - purely tag+location based discovery.
     */
    private List<FlickrPhoto> searchPhotosGeoTagsWithTimeWindow(String apiKey, TargetLocation location, String sortOrder, String tags, Long minUploadDate) {
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

            if (minUploadDate != null) {
                url.append("&min_upload_date=").append(minUploadDate);
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
                return new ArrayList<>();
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error in geo tags time-window search: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * Search with text= and optional place_id scoping.
     */
    private List<FlickrPhoto> searchPhotosWithPlaceScope(String apiKey, TargetLocation location, String sortOrder, String placeId) {
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

            if (StringUtils.hasText(placeId) && location.hasCoordinates()) {
                url.append("&place_id=").append(URLEncoder.encode(placeId, StandardCharsets.UTF_8));
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
                System.err.println("         ⚠️ Flickr API error for " + location.getName() + " with place scope");
                return new ArrayList<>();
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error searching with place scope: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    // ==================== PLACE ID SCOPING ====================

    /**
     * Search group with optional place_id scoping.
     */
    private List<FlickrPhoto> searchGroupWithPlaceScope(String apiKey, TargetLocation location, String groupId, String placeId) {
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

            if (StringUtils.hasText(placeId) && location.hasCoordinates()) {
                url.append("&place_id=").append(URLEncoder.encode(placeId, StandardCharsets.UTF_8));
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
                return new ArrayList<>();
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("         ❌ Error searching group with place scope: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    // ==================== TIME WINDOW LADDER ====================

    /**
     * Resolves Flickr place_id for given lat/lon. Returns null if outside GTA or API error.
     * Results are cached by rounded lat/lon (2 decimal places).
     */
    private String resolvePlaceIdForLatLon(String apiKey, double lat, double lng) {
        // Round to 2 decimals for cache key
        String cacheKey = String.format("%.2f,%.2f", lat, lng);
        if (placeIdCache.containsKey(cacheKey)) {
            String cached = placeIdCache.get(cacheKey);
            System.out.println("         🗺️ Place ID cache HIT: " + (cached != null ? cached : "(null)"));
            return cached;
        }

        try {
            StringBuilder url = new StringBuilder(FLICKR_API_BASE);
            url.append("?method=flickr.places.findByLatLon");
            url.append("&api_key=").append(apiKey);
            url.append("&lat=").append(lat);
            url.append("&lon=").append(lng);
            url.append("&accuracy=11");
            url.append("&format=json");
            url.append("&nojsoncallback=1");

            String responseStr = restTemplate.getForObject(url.toString(), String.class);
            if (responseStr == null) {
                placeIdCache.put(cacheKey, null);
                return null;
            }

            JsonNode root = objectMapper.readTree(responseStr);
            if (root == null || !"ok".equals(root.path("stat").asText())) {
                placeIdCache.put(cacheKey, null);
                return null;
            }

            JsonNode places = root.path("places").path("place");
            if (places == null || !places.isArray() || places.isEmpty()) {
                placeIdCache.put(cacheKey, null);
                System.out.println("         🗺️ Place ID cache MISS (no places found)");
                return null;
            }

            // Get first place and verify it's inside GTA
            JsonNode firstPlace = places.get(0);
            String placeId = firstPlace.path("place_id").asText(null);
            double placeLat = firstPlace.path("latitude").asDouble(0);
            double placeLng = firstPlace.path("longitude").asDouble(0);

            if (!isWithinGta(placeLat, placeLng)) {
                System.out.println("         🗺️ Place ID resolved but outside GTA bounds, ignoring");
                placeIdCache.put(cacheKey, null);
                return null;
            }

            System.out.println("         🗺️ Place ID cache MISS, resolved: " + placeId);
            placeIdCache.put(cacheKey, placeId);
            return placeId;
        } catch (Exception e) {
            System.err.println("         ❌ Error resolving place ID: " + e.getMessage());
            placeIdCache.put(cacheKey, null);
            return null;
        }
    }

    private long getCurrentUnixSeconds() {
        return System.currentTimeMillis() / 1000L;
    }

    private Long getMinUploadDateForWindow(String window) {
        long now = getCurrentUnixSeconds();
        switch (window) {
            case "RECENT":
                return now - TIME_WINDOW_RECENT;
            case "MID":
                return now - TIME_WINDOW_MID;
            default:
                return null; // FALLBACK - no time filter
        }
    }

    /**
     * Runs geo-first interestingness search with time window ladder.
     * Starts with RECENT, widens to MID if < MIN_KEEP, then FALLBACK.
     */
    private GeoSearchResult runGeoInterestingnessWithTimeLadder(String apiKey, TargetLocation location, FetchCounters counters) {
        String[] windows = {"RECENT", "MID", "FALLBACK"};
        
        for (String window : windows) {
            Long minUploadDate = getMinUploadDateForWindow(window);
            List<FlickrPhoto> photos = searchPhotosGeoWithTimeWindow(apiKey, location, "interestingness-desc", minUploadDate);
            List<FlickrPhoto> clamped = clampToGtaAndRadius(location, photos, counters);
            
            if (clamped.size() >= MIN_KEEP_FOR_TIME_WIDEN || "FALLBACK".equals(window)) {
                return new GeoSearchResult(clamped, window);
            }
            System.out.println("         ⏰ Geo-interesting " + window + " yielded " + clamped.size() + " photos, widening time window...");
        }
        
        return new GeoSearchResult(new ArrayList<>(), "FALLBACK");
    }

    /**
     * Runs geo tag bucket search with time window ladder.
     */
    private GeoSearchResult runGeoTagBucketWithTimeLadder(String apiKey, TargetLocation location, String[] bucket, FetchCounters counters) {
        String tags = String.join(",", bucket);
        String[] windows = {"RECENT", "MID", "FALLBACK"};
        
        for (String window : windows) {
            Long minUploadDate = getMinUploadDateForWindow(window);
            List<FlickrPhoto> photos = searchPhotosGeoTagsWithTimeWindow(apiKey, location, "relevance", tags, minUploadDate);
            List<FlickrPhoto> clamped = clampToGtaAndRadius(location, photos, counters);
            
            if (clamped.size() >= MIN_KEEP_FOR_TIME_WIDEN || "FALLBACK".equals(window)) {
                return new GeoSearchResult(clamped, window);
            }
        }
        
        return new GeoSearchResult(new ArrayList<>(), "FALLBACK");
    }

    // ==================== TAG BUCKET SELECTION ====================

    /** Tags that suggest crowd/event content; we down-rank these in diversity so photogenic shots are preferred. */
    private static final Set<String> CROWD_EVENT_TAGS = Set.of("people", "crowd", "festival", "event", "parade");

    /**
     * Select up to 2 buckets for landmark based on name keywords and density.
     * Dense downtown (small radius): ARCHITECTURE + NIGHT_VIBE for photogenic intent.
     */
    private String[][] selectBucketsForLandmark(TargetLocation location) {
        String nameLower = location.getName().toLowerCase();
        boolean isNature = NATURE_KEYWORDS.stream().anyMatch(nameLower::contains);
        boolean isDenseDowntown = location.getRadiusKm() <= 0.5;

        if (isNature) {
            return new String[][]{NATURE_PARK_BUCKET, STREET_ART_BUCKET};
        }
        if (isDenseDowntown) {
            return new String[][]{ARCHITECTURE_BUCKET, NIGHT_VIBE_BUCKET};
        }
        return new String[][]{STREET_ART_BUCKET, NIGHT_VIBE_BUCKET};
    }

    /**
     * Select bucket for tile based on tile index (deterministic rotation).
     */
    private String[] selectBucketForTile(int tileIndex) {
        return ALL_BUCKETS[tileIndex % ALL_BUCKETS.length];
    }

    // ==================== DIVERSITY SELECTION ====================

    /**
     * Apply diversity pruning: cap per owner, cap per coordinate bin.
     * Returns filtered list with preserved deterministic ordering.
     */
    private List<FlickrPhoto> applyDiversityPruning(List<FlickrPhoto> photos, int maxPerOwner) {
        if (photos.isEmpty()) {
            return photos;
        }

        // Sort: prefer non-crowd/event tags, then views desc, then resolution (pixels), then date, then id
        List<FlickrPhoto> sorted = new ArrayList<>(photos);
        sorted.sort(Comparator
                .comparingInt((FlickrPhoto p) -> hasAnyTag(p, CROWD_EVENT_TAGS) ? 1 : 0)
                .thenComparingInt(FlickrPhoto::getViews).reversed()
                .thenComparingLong((FlickrPhoto p) -> effectivePixelCount(p)).reversed()
                .thenComparingLong(FlickrPhoto::getDateUpload).reversed()
                .thenComparing(FlickrPhoto::getId));

        Map<String, Integer> ownerCounts = new HashMap<>();
        Map<String, Integer> coordBinCounts = new HashMap<>();
        List<FlickrPhoto> result = new ArrayList<>();
        int ownerCapped = 0;
        int coordCapped = 0;

        for (FlickrPhoto photo : sorted) {
            // Use owner (NSID) if available, fallback to ownerName
            String ownerId = StringUtils.hasText(photo.getOwner()) ? photo.getOwner() : 
                            (StringUtils.hasText(photo.getOwnerName()) ? photo.getOwnerName() : "unknown");
            
            // Coordinate bin key (rounded to 4 decimal places ~ 11m)
            String coordKey = formattedKey(
                    roundToPrecision(photo.getLatitude(), HOTSPOT_PRECISION),
                    roundToPrecision(photo.getLongitude(), HOTSPOT_PRECISION));

            int ownerCount = ownerCounts.getOrDefault(ownerId, 0);
            int coordCount = coordBinCounts.getOrDefault(coordKey, 0);

            if (ownerCount >= maxPerOwner) {
                ownerCapped++;
                continue;
            }
            if (coordCount >= MAX_PER_COORD_BIN) {
                coordCapped++;
                continue;
            }

            result.add(photo);
            ownerCounts.put(ownerId, ownerCount + 1);
            coordBinCounts.put(coordKey, coordCount + 1);
        }

        if (ownerCapped > 0 || coordCapped > 0) {
            System.out.println("         🎯 Diversity pruning: owner-capped=" + ownerCapped + ", coord-capped=" + coordCapped);
        }

        return result;
    }

    /**
     * Ensure some tag variety is preserved (NIGHT_VIBE, SEASONAL) even if views are lower.
     */
    private List<FlickrPhoto> ensureTagVariety(List<FlickrPhoto> photos, int targetVarietyCount) {
        if (photos.size() <= targetVarietyCount) {
            return photos;
        }

        Set<String> nightVibeTokens = Set.of(NIGHT_VIBE_BUCKET);
        Set<String> seasonalTokens = Set.of(SEASONAL_BUCKET);

        List<FlickrPhoto> nightVibePhotos = new ArrayList<>();
        List<FlickrPhoto> seasonalPhotos = new ArrayList<>();
        List<FlickrPhoto> others = new ArrayList<>();

        for (FlickrPhoto photo : photos) {
            Set<String> tokens = tokenize(photo.getTags());
            tokens.addAll(tokenize(photo.getTitle()));
            
            if (tokens.stream().anyMatch(nightVibeTokens::contains)) {
                nightVibePhotos.add(photo);
            } else if (tokens.stream().anyMatch(seasonalTokens::contains)) {
                seasonalPhotos.add(photo);
            } else {
                others.add(photo);
            }
        }

        // Ensure at least a small slice of variety photos
        int varietySlice = Math.min(targetVarietyCount, (int) Math.ceil(photos.size() * 0.1));
        List<FlickrPhoto> result = new ArrayList<>(others);
        
        int nightAdded = 0;
        for (FlickrPhoto p : nightVibePhotos) {
            if (nightAdded < varietySlice / 2) {
                result.add(p);
                nightAdded++;
            }
        }
        int seasonalAdded = 0;
        for (FlickrPhoto p : seasonalPhotos) {
            if (seasonalAdded < varietySlice / 2) {
                result.add(p);
                seasonalAdded++;
            }
        }

        // Re-sort for consistent ordering
        result.sort(Comparator
                .comparingInt(FlickrPhoto::getViews).reversed()
                .thenComparingLong(FlickrPhoto::getDateUpload).reversed()
                .thenComparing(FlickrPhoto::getId));

        return result;
    }
}
