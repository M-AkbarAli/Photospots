package com.photospots.service;

import io.github.cdimascio.dotenv.Dotenv;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

@Service
public class FlickrSeedService {

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
     * STEP 1: Fetch photos from Flickr API
     */
    public List<FlickrPhoto> fetchFlickrPhotos(double lat, double lng, int radiusKm) throws Exception {
        String apiKey = resolveValue(flickrApiKey, "FLICKR_API_KEY");
        if (!StringUtils.hasText(apiKey)) {
            throw new Exception("FLICKR_API_KEY is not set in environment");
        }
        resolveValue(flickrApiSecret, "FLICKR_API_SECRET"); // ensure secret presence if needed

        String url = String.format(
            "https://api.flickr.com/services/rest/" +
            "?method=flickr.photos.search" +
            "&api_key=%s" +
            "&lat=%f" +
            "&lon=%f" +
            "&radius=%d" +
            "&radius_units=km" +
            "&has_geo=1" +
            "&accuracy=16" +
            "&extras=geo,url_b,tags" +
            "&per_page=250" +
            "&sort=interestingness-desc" +
            "&content_type=1" +
            "&format=json" +
            "&nojsoncallback=1",
            apiKey, lat, lng, radiusKm
        );

        try {
            FlickrResponse response = restTemplate.getForObject(url, FlickrResponse.class);
            if (response == null || !"ok".equals(response.getStat())) {
                throw new Exception("Flickr API error: " + (response != null ? response.getStat() : "null response"));
            }
            return response.getPhotos() != null ? response.getPhotos().getPhoto() : new ArrayList<>();
        } catch (Exception e) {
            System.err.println("❌ Error fetching from Flickr: " + e.getMessage());
            throw e;
        }
    }

    /**
     * STEP 2: Identify Landmarks by Analyzing Tags
     */
    public List<Landmark> identifyLandmarks(List<FlickrPhoto> photos, int minPhotoCount) {
        Map<String, List<FlickrPhoto>> tagToPhotos = new HashMap<>();

        // Build tag map
        for (FlickrPhoto photo : photos) {
            if (photo.getTags() == null || photo.getTags().isEmpty()) {
                continue;
            }
            String[] tags = photo.getTags().split(" ");
            for (String tag : tags) {
                if (tag.isEmpty()) {
                    continue;
                }
                tagToPhotos.computeIfAbsent(tag, k -> new ArrayList<>()).add(photo);
            }
        }

        // Generic tags to filter
        Set<String> genericTags = getGenericTags();

        // Filter and convert to landmarks
        List<Landmark> landmarks = new ArrayList<>();
        for (Map.Entry<String, List<FlickrPhoto>> entry : tagToPhotos.entrySet()) {
            String tag = entry.getKey();
            List<FlickrPhoto> photoList = entry.getValue();

            String tagLower = tag.toLowerCase();
            if (genericTags.contains(tagLower)) {
                continue;
            }
            if (tag.length() < 3 || tag.length() > 30) {
                continue;
            }
            if (tag.matches(".*\\d{3,}.*")) { // Contains 3+ consecutive digits
                continue;
            }
            long capitalCount = tag.chars().filter(Character::isUpperCase).count();
            if (capitalCount > 2) {
                continue;
            }
            if (photoList.size() < minPhotoCount) {
                continue;
            }

            landmarks.add(new Landmark(tag, photoList.size(), photoList));
        }

        // Sort by photo count
        landmarks.sort((a, b) -> Integer.compare(b.getPhotoCount(), a.getPhotoCount()));
        return landmarks;
    }

    /**
     * STEP 3: Group Photos into Hotspots by Location
     */
    public List<Hotspot> groupPhotosIntoHotspots(Landmark landmark, int minPhotosPerHotspot) {
        final int PRECISION = 4;
        Map<String, List<FlickrPhoto>> hotspotMap = new HashMap<>();

        // Group by location
        for (FlickrPhoto photo : landmark.getPhotos()) {
            if (photo.getLatitude() == 0 || photo.getLongitude() == 0) {
                continue;
            }
            double lat = photo.getLatitude();
            double lng = photo.getLongitude();
            String key = String.format("%." + PRECISION + "f,%." + PRECISION + "f", lat, lng);

            hotspotMap.computeIfAbsent(key, k -> new ArrayList<>()).add(photo);
        }

        // Convert to hotspots
        List<Hotspot> hotspots = new ArrayList<>();
        for (Map.Entry<String, List<FlickrPhoto>> entry : hotspotMap.entrySet()) {
            List<FlickrPhoto> photos = entry.getValue();
            if (photos.size() < minPhotosPerHotspot) {
                continue;
            }
            String[] coords = entry.getKey().split(",");
            double lat = Double.parseDouble(coords[0]);
            double lng = Double.parseDouble(coords[1]);
            hotspots.add(new Hotspot(lat, lng, photos.size(), photos));
        }

        // Sort by popularity
        hotspots.sort((a, b) -> Integer.compare(b.getPhotoCount(), a.getPhotoCount()));
        return hotspots;
    }

    /**
     * STEP 4: Insert Data into Supabase Database
     */
    public void insertLandmarkAndHotspots(Landmark landmark, List<Hotspot> hotspots) throws Exception {
        // Calculate landmark center
        double avgLat = 0, avgLng = 0;
        for (FlickrPhoto photo : landmark.getPhotos()) {
            avgLat += photo.getLatitude();
            avgLng += photo.getLongitude();
        }
        avgLat /= landmark.getPhotos().size();
        avgLng /= landmark.getPhotos().size();

        String coverUrl = getFlickrPhotoUrl(landmark.getPhotos().get(0), "b");

        // Check if landmark exists
        String checkSql = "select id from spots where name = ? and source = ? limit 1";
        List<String> existing = jdbcTemplate.query(checkSql, 
            (rs, rowNum) -> rs.getString("id"), 
            landmark.getName(), "flickr");

        String landmarkId;
        if (!existing.isEmpty()) {
            landmarkId = existing.get(0);
        } else {
            // Insert landmark
            String insertSql = 
                "insert into spots (name, lat, lng, geom, photo_url, source, score, categories, description) " +
                "values (?, ?, ?, st_geomfromtext(?, 4326), ?, ?, ?, array[?], ?) " +
                "returning id";
            
            List<String> result = jdbcTemplate.query(insertSql,
                (rs, rowNum) -> rs.getString("id"),
                landmark.getName(),
                avgLat,
                avgLng,
                String.format("POINT(%f %f)", avgLng, avgLat),
                coverUrl,
                "flickr",
                Math.min((double) landmark.getPhotoCount() / 50, 1.0),
                "landmark",
                "Landmark with " + landmark.getPhotoCount() + " photos from Flickr"
            );
            landmarkId = result.isEmpty() ? null : result.get(0);
        }

        // Insert hotspots
        for (Hotspot hotspot : hotspots) {
            String checkHotspot = "select id from spots where lat = ? and lng = ? and source = ? limit 1";
            List<String> existingHotspot = jdbcTemplate.query(checkHotspot,
                (rs, rowNum) -> rs.getString("id"),
                hotspot.getLat(),
                hotspot.getLng(),
                "flickr");

            String hotspotId;
            if (!existingHotspot.isEmpty()) {
                hotspotId = existingHotspot.get(0);
            } else {
                String coverPhoto = getFlickrPhotoUrl(hotspot.getPhotos().get(0), "b");
                String insertHotspot = 
                    "insert into spots (name, lat, lng, geom, photo_url, source, score, categories, description) " +
                    "values (?, ?, ?, st_geomfromtext(?, 4326), ?, ?, ?, array[?], ?) " +
                    "returning id";
                
                List<String> result = jdbcTemplate.query(insertHotspot,
                    (rs, rowNum) -> rs.getString("id"),
                    "Hotspot for " + landmark.getName(),
                    hotspot.getLat(),
                    hotspot.getLng(),
                    String.format("POINT(%f %f)", hotspot.getLng(), hotspot.getLat()),
                    coverPhoto,
                    "flickr",
                    Math.min((double) hotspot.getPhotoCount() / 10, 1.0),
                    "hotspot",
                    hotspot.getPhotoCount() + " photos of " + landmark.getName() + " taken from here"
                );
                hotspotId = result.isEmpty() ? null : result.get(0);
            }

            // Insert photos
            insertPhotosForHotspot(hotspotId, hotspot.getPhotos());
        }
    }

    private void insertPhotosForHotspot(String hotspotId, List<FlickrPhoto> photos) throws Exception {
        // Get existing keys
        String checkSql = "select original_key from photos where spot_id = ?";
        Set<String> existing = new HashSet<>(jdbcTemplate.query(checkSql,
            (rs, rowNum) -> rs.getString("original_key"),
            hotspotId));

        // Build insert list
        List<String> toInsert = new ArrayList<>();
        for (FlickrPhoto photo : photos) {
            String key = "flickr:" + photo.getId();
            if (!existing.contains(key)) {
                toInsert.add(key);
            }
        }

        if (toInsert.isEmpty()) {
            return;
        }

        // Insert new photos
        String insertSql = 
            "insert into photos (spot_id, original_key, variants, visibility) values (?, ?, " +
            "jsonb_build_object('small', ?, 'medium', ?, 'large', ?, 'original', ?), ?)";

        for (FlickrPhoto photo : photos) {
            String key = "flickr:" + photo.getId();
            if (toInsert.contains(key)) {
                jdbcTemplate.update(insertSql,
                    hotspotId,
                    key,
                    getFlickrPhotoUrl(photo, "s"),
                    getFlickrPhotoUrl(photo, "m"),
                    getFlickrPhotoUrl(photo, "b"),
                    getFlickrPhotoUrl(photo, "o"),
                    "public"
                );
            }
        }
    }

    private String getFlickrPhotoUrl(FlickrPhoto photo, String size) {
        return String.format("https://farm%d.staticflickr.com/%s/%s_%s_%s.jpg",
            photo.getFarm(), photo.getServer(), photo.getId(), photo.getSecret(), size);
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

    private Set<String> getGenericTags() {
        Set<String> tags = new HashSet<>();
        // Location names
        tags.addAll(List.of("toronto", "ontario", "canada", "scarborough", "scarboroughontario", 
            "torontoontario", "northyork", "etobicoke", "mississauga", "markham", "vaughan", 
            "torontocanada"));
        // Generic photo/tech
        tags.addAll(List.of("photo", "image", "picture", "photooftheday", "photography", 
            "photographer", "phone", "iphone", "samsung", "mobile", "cellphone", "smartphone",
            "camera", "canon", "nikon", "sony", "pentax", "fuji", "fujifilm", "olympus",
            "lens", "dslr", "mirrorless", "pro", "promax"));
        // Years & dates
        tags.addAll(List.of("2024", "2023", "2022", "2021", "2025", "2020", "2019", "2018", 
            "2017", "2016", "january", "february", "march", "april", "may", "june", "july",
            "august", "september", "october", "november", "december"));
        // Generic descriptors
        tags.addAll(List.of("the", "a", "an", "and", "or", "in", "at", "on", "of", "for", "with"));
        // Urban/location
        tags.addAll(List.of("streetphotography", "street", "urban", "city", "downtown", "uptown",
            "midtown", "outdoor", "outdoors", "indoor", "indoors", "outside", "inside",
            "building", "buildings", "architecture", "construction", "torontoconstruction",
            "skyscraper", "highrise", "tower", "towers", "supertall", "supertallskyscraper",
            "supertallbuilding", "skygrid", "condo", "condos", "apartment", "apartments"));
        // Activities/objects
        tags.addAll(List.of("food", "drink", "coffee", "restaurant", "cafe", "dining",
            "shopping", "shop", "store", "shops", "stores", "retail",
            "window", "windowdisplay", "display", "sign", "signage",
            "art", "mural", "graffiti", "sculpture", "statue",
            "people", "person", "crowd", "crowds", "man", "woman", "child"));
        // Events/times
        tags.addAll(List.of("fair", "festival", "event", "concert", "show", "exhibition",
            "protest", "rally", "demonstration", "march", "parade",
            "night", "day", "morning", "afternoon", "evening", "sunset", "sunrise",
            "summer", "winter", "spring", "fall", "autumn"));
        // Transit
        tags.addAll(List.of("transit", "ttc", "subway", "bus", "streetcar", "train", "tram",
            "torontotransit", "metrolinx", "gotransit", "line1", "line2",
            "flexity", "bombardier", "ttcflexity", "lrv", "fleet"));
        // Street names
        tags.addAll(List.of("bloor", "yonge", "queen", "king", "dundas", "college", "wellesley",
            "bay", "university", "spadina", "bathurst"));
        // Companies
        tags.addAll(List.of("tridel", "mizrahi", "mizrahidevelopments", "cadillacfairview"));
        // Colors
        tags.addAll(List.of("red", "blue", "green", "yellow", "black", "white", "grey", "gray",
            "new", "old", "modern", "historic", "contemporary", "vintage"));
        // Photo subjects
        tags.addAll(List.of("selfportrait", "selfie", "portrait", "pattern", "light", "shadow",
            "reflection", "abstract", "detail", "texture", "perspective"));
        return tags;
    }
}
