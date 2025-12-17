package com.photospots.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import io.github.cdimascio.dotenv.Dotenv;

/**
 * Service for seeding photo spots from Flickr API.
 * 
 * Strategy (from seedscript.md):
 * 1. Search by text (place name) for relevance
 * 2. Search by text sorted by interestingness for quality
 * 3. Optionally search within Flickr groups
 * 4. Merge results and remove duplicates by photo ID
 * 5. Filter for quality (resolution, geo data)
 * 6. Store in database
 */
@Service
public class FlickrSeedService {

    /**
     * Result of seeding a location.
     */
    public static class SeedResult {
        private final String locationName;
        private final int totalPhotos;
        private final int insertedPhotos;

        public SeedResult(String locationName, int totalPhotos, int insertedPhotos) {
            this.locationName = locationName;
            this.totalPhotos = totalPhotos;
            this.insertedPhotos = insertedPhotos;
        }

        public String getLocationName() {
            return locationName;
        }

        public int getTotalPhotos() {
            return totalPhotos;
        }

        public int getInsertedPhotos() {
            return insertedPhotos;
        }
    }
    private static final String FLICKR_API_BASE = "https://api.flickr.com/services/rest/";
    private static final String EXTRAS = "url_l,url_o,url_z,url_c,url_b,geo,owner_name,views,tags";
    private static final int PER_PAGE = 100;
    private static final int MIN_RESOLUTION = 800;

    private static final long REQUEST_DELAY_MS = 500; // 0.5 seconds between requests

    // Toronto Flickr Group ID (optional enhancement)
    private static final String TORONTO_GROUP_ID = "36521959@N00"; // Toronto Pool group
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

    /**
     * Main entry point: Seed photos for a target location.
     * Follows the seedscript.md strategy closely.
     */
    public SeedResult seedLocation(TargetLocation location) throws Exception {
        String apiKey = resolveValue(flickrApiKey, "FLICKR_API_KEY");
        if (!StringUtils.hasText(apiKey)) {
            throw new Exception("FLICKR_API_KEY is not set in environment");
        }

        System.out.println("   📍 Processing: " + location.getName());

        Set<String> seenPhotoIds = new HashSet<>();
        List<FlickrPhoto> allPhotos = new ArrayList<>();

        // STEP 1: Search by relevance (text search with location name)
        System.out.println("      🔍 Searching by relevance...");
        List<FlickrPhoto> relevancePhotos = searchPhotos(apiKey, location, "relevance");
        int relevanceCount = addUniquePhotos(relevancePhotos, allPhotos, seenPhotoIds);
        System.out.println("         Found " + relevancePhotos.size() + " photos, " + relevanceCount + " unique");
        
        rateLimitDelay();

        // STEP 2: Search by interestingness
        System.out.println("      ⭐ Searching by interestingness...");
        List<FlickrPhoto> interestingPhotos = searchPhotos(apiKey, location, "interestingness-desc");
        int interestingCount = addUniquePhotos(interestingPhotos, allPhotos, seenPhotoIds);
        System.out.println("         Found " + interestingPhotos.size() + " photos, " + interestingCount + " unique");

        rateLimitDelay();

        // STEP 3: Search alternate names if provided
        if (location.getAlternateNames() != null && location.getAlternateNames().length > 0) {
            for (String altName : location.getAlternateNames()) {
                System.out.println("      🔄 Searching alternate name: " + altName);
                TargetLocation altLocation = new TargetLocation(altName, 
                    location.getLatitude(), location.getLongitude(), location.getRadiusKm());
                List<FlickrPhoto> altPhotos = searchPhotos(apiKey, altLocation, "relevance");
                int altCount = addUniquePhotos(altPhotos, allPhotos, seenPhotoIds);
                System.out.println("         Found " + altPhotos.size() + " photos, " + altCount + " unique");
                rateLimitDelay();
            }
        }

        // STEP 4: Optionally search Toronto group (if location is in GTA)
        if (isInTorontoArea(location)) {
            System.out.println("      🏙️ Searching Toronto Flickr group...");
            List<FlickrPhoto> groupPhotos = searchGroup(apiKey, location.getName(), TORONTO_GROUP_ID);
            int groupCount = addUniquePhotos(groupPhotos, allPhotos, seenPhotoIds);
            System.out.println("         Found " + groupPhotos.size() + " photos, " + groupCount + " unique");
            rateLimitDelay();
        }

        // STEP 5: Filter for quality
        System.out.println("      🔧 Filtering for quality...");
        List<FlickrPhoto> qualityPhotos = filterForQuality(allPhotos);
        System.out.println("         After filtering: " + qualityPhotos.size() + " photos");

        if (qualityPhotos.isEmpty()) {
            System.out.println("      ⚠️ No quality photos found for " + location.getName());
            return new SeedResult(location.getName(), 0, 0);
        }

        // STEP 6: Insert into database
        System.out.println("      💾 Inserting into database...");
        int insertedCount = insertLocationWithPhotos(location, qualityPhotos);
        System.out.println("      ✅ Inserted " + insertedCount + " photos for " + location.getName());

        return new SeedResult(location.getName(), qualityPhotos.size(), insertedCount);
    }

    /**
     * Insert a location and its photos into the database.
     */
    @Transactional
    public int insertLocationWithPhotos(TargetLocation location, List<FlickrPhoto> photos) throws Exception {
        if (photos.isEmpty()) return 0;

        // Calculate average coordinates from photos for location center
        double avgLat = 0, avgLng = 0;
        for (FlickrPhoto photo : photos) {
            avgLat += photo.getLatitude();
            avgLng += photo.getLongitude();
        }
        avgLat /= photos.size();
        avgLng /= photos.size();

        // Use location coordinates if provided, otherwise use photo average
        double spotLat = location.hasCoordinates() ? location.getLatitude() : avgLat;
        double spotLng = location.hasCoordinates() ? location.getLongitude() : avgLng;

        // Get the best photo as cover (first one, assuming sorted by relevance/quality)
        String coverUrl = photos.get(0).getBestUrl();

        // Check if spot already exists
        String checkSql = "SELECT id FROM spots WHERE name = ? AND source = 'flickr' LIMIT 1";
        List<String> existing = jdbcTemplate.query(checkSql,
            (rs, rowNum) -> rs.getString("id"),
            location.getName());

        String spotId;
        if (!existing.isEmpty()) {
            spotId = existing.get(0);
            System.out.println("         📝 Spot exists, updating photos...");
        } else {
            // Insert new spot
            String insertSql =
                "INSERT INTO spots (name, lat, lng, geom, photo_url, source, score, categories, description) " +
                "VALUES (?, ?, ?, ST_GeomFromText(?, 4326), ?, 'flickr', ?, ARRAY['landmark'], ?) " +
                "RETURNING id";

            double score = Math.min((double) photos.size() / 50.0, 1.0);
            String description = "Photo spot with " + photos.size() + " photos from Flickr";

            List<String> result = jdbcTemplate.query(insertSql,
                (rs, rowNum) -> rs.getString("id"),
                location.getName(),
                spotLat,
                spotLng,
                String.format("POINT(%f %f)", spotLng, spotLat),
                coverUrl,
                score,
                description);

            spotId = result.isEmpty() ? null : result.get(0);
        }

        if (spotId == null) {
            return 0;
        }

        // Insert photos (with ON CONFLICT to handle duplicates)
        return insertPhotos(spotId, photos);
    }

    /**
     * Search Flickr for photos matching a location.
     */
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
            url.append("&content_type=1"); // Photos only (no screenshots)
            url.append("&format=json");
            url.append("&nojsoncallback=1");

            // Add geo filter if coordinates are available
            if (location.hasCoordinates()) {
                url.append("&lat=").append(location.getLatitude());
                url.append("&lon=").append(location.getLongitude());
                url.append("&radius=").append(location.getRadiusKm());
                url.append("&radius_units=km");
                url.append("&accuracy=11"); // City level or better
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

    /**
     * Search within a Flickr group for photos.
     */
    private List<FlickrPhoto> searchGroup(String apiKey, String searchText, String groupId) {
        try {
            StringBuilder url = new StringBuilder(FLICKR_API_BASE);
            url.append("?method=flickr.photos.search");
            url.append("&api_key=").append(apiKey);
            url.append("&group_id=").append(groupId);
            url.append("&text=").append(URLEncoder.encode(searchText, StandardCharsets.UTF_8));
            url.append("&sort=relevance");
            url.append("&per_page=50"); // Smaller for group search
            url.append("&page=1");
            url.append("&extras=").append(EXTRAS);
            url.append("&has_geo=1");
            url.append("&safe_search=1");
            url.append("&format=json");
            url.append("&nojsoncallback=1");

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

    /**
     * Add unique photos to the list, checking by photo ID.
     * Returns the count of newly added photos.
     */
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

    /**
     * Filter photos for quality:
     * - Must have valid geo coordinates
     * - Must have minimum resolution
     * - Must have a usable URL
     */
    private List<FlickrPhoto> filterForQuality(List<FlickrPhoto> photos) {
        List<FlickrPhoto> filtered = new ArrayList<>();
        for (FlickrPhoto photo : photos) {
            // Must have valid geo
            if (!photo.hasValidGeo()) {
                continue;
            }
            // Must have minimum resolution or usable URL
            if (!photo.hasMinimumResolution()) {
                continue;
            }
            // Must have a URL
            String url = photo.getBestUrl();
            if (url == null || url.isEmpty()) {
                continue;
            }
            filtered.add(photo);
        }
        return filtered;
    }

    /**
     * Insert photos for a spot.
     */
    private int insertPhotos(String spotId, List<FlickrPhoto> photos) {
        String insertSql =
            "INSERT INTO photos (spot_id, original_key, variants, visibility) " +
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
            "), 'public') " +
            "ON CONFLICT (original_key) DO NOTHING";

        List<Object[]> batchArgs = new ArrayList<>();
        for (FlickrPhoto photo : photos) {
            String smallUrl = photo.getUrlZ() != null ? photo.getUrlZ() : 
                constructUrl(photo, "s");
            String mediumUrl = photo.getUrlC() != null ? photo.getUrlC() : 
                constructUrl(photo, "m");
            String largeUrl = photo.getUrlL() != null ? photo.getUrlL() : 
                photo.getUrlB() != null ? photo.getUrlB() : constructUrl(photo, "b");
            String originalUrl = photo.getUrlO() != null ? photo.getUrlO() : largeUrl;

            batchArgs.add(new Object[]{
                UUID.fromString(spotId),
                "flickr:" + photo.getId(),
                smallUrl,
                mediumUrl,
                largeUrl,
                originalUrl,
                photo.getLatitude(),
                photo.getLongitude(),
                photo.getOwnerName() != null ? photo.getOwnerName() : "Unknown",
                photo.getViews(),
                photo.getTitle() != null ? photo.getTitle() : ""
            });
        }

        if (!batchArgs.isEmpty()) {
            int[] results = jdbcTemplate.batchUpdate(insertSql, batchArgs);
            int inserted = 0;
            for (int r : results) {
                if (r > 0) inserted++;
            }
            return inserted;
        }
        return 0;
    }

    /**
     * Construct a Flickr static photo URL.
     */
    private String constructUrl(FlickrPhoto photo, String size) {
        return String.format("https://farm%d.staticflickr.com/%s/%s_%s_%s.jpg",
            photo.getFarm(), photo.getServer(), photo.getId(), photo.getSecret(), size);
    }

    /**
     * Check if location is in the Toronto area (for group search).
     */
    private boolean isInTorontoArea(TargetLocation location) {
        if (!location.hasCoordinates()) {
            // Check by name
            String name = location.getName().toLowerCase();
            return name.contains("toronto") || name.contains("scarborough") ||
                   name.contains("north york") || name.contains("etobicoke") ||
                   name.contains("mississauga") || name.contains("markham") ||
                   name.contains("vaughan") || name.contains("brampton") ||
                   name.contains("gta") || name.contains("ontario");
        }
        // Check by coordinates (rough Toronto bounding box)
        double lat = location.getLatitude();
        double lng = location.getLongitude();
        return lat >= 43.5 && lat <= 44.0 && lng >= -79.8 && lng <= -79.0;
    }

    /**
     * Delay between API requests to respect rate limits.
     */
    private void rateLimitDelay() {
        try {
            Thread.sleep(REQUEST_DELAY_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Resolve a configuration value from properties, env, or dotenv.
     */
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
}
