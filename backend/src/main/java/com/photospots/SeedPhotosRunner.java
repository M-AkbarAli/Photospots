package com.photospots;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.photospots.service.AreaConfig;
import com.photospots.service.FlickrSeedService;
import com.photospots.service.FlickrSeedService.SeedResult;
import com.photospots.service.TargetLocation;

/**
 * Seed script runner that populates the database with photo spots from Flickr.
 * 
 * Run with: ./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed"
 * 
 * This follows the seedscript.md plan:
 * 1. Define target locations with names and coordinates
 * 2. For each location, search Flickr by relevance and interestingness
 * 3. Merge results, remove duplicates, filter for quality
 * 4. Insert into database
 */
@Component
public class SeedPhotosRunner implements ApplicationRunner {

    private final FlickrSeedService flickrSeedService;
    private final JdbcTemplate jdbcTemplate;

    @Value("${spring.datasource.url}")
    private String datasourceUrl;

    public SeedPhotosRunner(FlickrSeedService flickrSeedService, JdbcTemplate jdbcTemplate) {
        this.flickrSeedService = flickrSeedService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        boolean areaMode = args.containsOption("seed-area");
        boolean landmarkMode = args.containsOption("seed");

        if (!areaMode && !landmarkMode) {
            return;
        }

        boolean resetMode = args.containsOption("seed-reset");
        if (resetMode) {
            // Safety guard: prevent accidental reset of fallback (production) database
            boolean overrideFlag = args.containsOption("i-know-what-im-doing");
            boolean isFreshDb = datasourceUrl != null && datasourceUrl.contains(":5433/");
            boolean isFallbackDb = datasourceUrl != null && datasourceUrl.contains(":5432/");

            System.out.println("⚠️  Reset mode enabled!");
            System.out.println("   📊 Current datasource: " + (datasourceUrl != null ? datasourceUrl.replaceAll("password=[^&;]*", "password=***") : "unknown"));
            
            if (isFallbackDb && !overrideFlag) {
                System.out.println();
                System.out.println("╔══════════════════════════════════════════════════════════════════╗");
                System.out.println("║                    🚨 SAFETY GUARD TRIGGERED                      ║");
                System.out.println("╚══════════════════════════════════════════════════════════════════╝");
                System.out.println();
                System.out.println("   ❌ REFUSING to reset the FALLBACK database (port 5432)");
                System.out.println("   This appears to be your production/stable database with existing seed data.");
                System.out.println();
                System.out.println("   To reset anyway (⚠️  DANGER ZONE), add the flag:");
                System.out.println("      --i-know-what-im-doing");
                System.out.println();
                System.out.println("   To safely test re-seeding:");
                System.out.println("      1. Point to the fresh DB: SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/photospots");
                System.out.println("      2. Then run with --seed-reset");
                System.out.println();
                System.exit(1);
            }
            
            if (overrideFlag) {
                System.out.println("   ⚠️  Override flag detected - proceeding with reset!");
            } else if (isFreshDb) {
                System.out.println("   ✅ Fresh database detected (port 5433) - safe to reset");
            }
            
            System.out.println("   🗑️  Truncating spots and photos...");
            resetSeedData();
        }

        boolean visionEnabled = true;
        if (args.containsOption("vision-filter")) {
            List<String> values = args.getOptionValues("vision-filter");
            if (values != null && !values.isEmpty()) {
                visionEnabled = Boolean.parseBoolean(values.get(0));
            }
        }

        System.out.println("\n");
        System.out.println("╔══════════════════════════════════════════════════════════════════╗");
        System.out.println("║           🌍 FLICKR PHOTO SPOT SEED SCRIPT                       ║");
        System.out.println("║   Following seedscript.md strategy for photo spot population     ║");
        System.out.println("╚══════════════════════════════════════════════════════════════════╝");
        System.out.println();
        System.out.println("   • Vision filter: " + (visionEnabled ? "enabled" : "disabled"));
        System.out.println();

        if (areaMode) {
            List<String> areaValues = args.getOptionValues("seed-area");
            if (areaValues == null || areaValues.isEmpty()) {
                System.out.println("⚠️  seed-area provided without a key, skipping");
                return;
            }
            String areaKey = areaValues.get(0);
            List<AreaConfig> areas = loadAreas();
            AreaConfig targetArea = areas.stream()
                    .filter(a -> a.getKey().equalsIgnoreCase(areaKey))
                    .findFirst()
                    .orElse(null);
            if (targetArea == null) {
                System.out.println("⚠️  Area key not found: " + areaKey);
                return;
            }

            System.out.println("📋 Area Target: " + targetArea.getName() + " (" + targetArea.getKey() + ")");
            SeedResult areaResult = flickrSeedService.seedArea(targetArea, visionEnabled);

            System.out.println();
            System.out.println("╔══════════════════════════════════════════════════════════════════╗");
            System.out.println("║                    🎉 AREA SEED COMPLETE!                        ║");
            System.out.println("╚══════════════════════════════════════════════════════════════════╝");
            System.out.println();
            System.out.println("📊 Summary:");
            System.out.println("   • Area: " + targetArea.getName());
            System.out.println("   • Total photos attempted: " + areaResult.getPhotosAttempted());
            System.out.println("   • Total photos inserted: " + areaResult.getInsertedPhotos());
            System.out.println("   • Conflict-skipped (existing): " + areaResult.getConflictSkipped());
            System.out.println("   • Failed inserts (exceptions): " + areaResult.getFailedInsert());
            System.out.println("   • Hotspot spots upserted: " + areaResult.getHotspotUpserts());
            System.out.println();
            return;
        }

        // Load target locations from JSON (configurable)
        List<TargetLocation> targetLocations = loadTargetLocations();

        System.out.println("📋 Target Locations: " + targetLocations.size());
        System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        for (TargetLocation loc : targetLocations) {
            System.out.println("   • " + loc);
        }
        System.out.println();

        // Process each location
        int successCount = 0;
        int failCount = 0;
        int totalPhotosInserted = 0;
        int totalPhotosAttempted = 0;
        int totalLandmarks = 0;
        int totalHotspots = 0;
        int totalMissingGeo = 0;
        int totalMissingUrl = 0;
        int totalDuplicates = 0;
        int totalFailedInsert = 0;
        int totalConflictSkipped = 0;
        List<SeedResult> results = new ArrayList<>();

        for (int i = 0; i < targetLocations.size(); i++) {
            TargetLocation location = targetLocations.get(i);
            System.out.println();
            System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            System.out.println("📍 [" + (i + 1) + "/" + targetLocations.size() + "] Processing: " + location.getName());
            System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            try {
                SeedResult result = flickrSeedService.seedLocation(location, visionEnabled);
                results.add(result);
                totalLandmarks += result.getLandmarkUpserts();
                totalHotspots += result.getHotspotUpserts();
                totalMissingGeo += result.getMissingGeo();
                totalMissingUrl += result.getMissingUrl();
                totalDuplicates += result.getDuplicateCount();
                totalConflictSkipped += result.getConflictSkipped();
                totalFailedInsert += result.getFailedInsert();
                totalPhotosAttempted += result.getPhotosAttempted();
                
                if (result.getInsertedPhotos() > 0) {
                    successCount++;
                    totalPhotosInserted += result.getInsertedPhotos();
                    System.out.println("   ✅ Success: " + result.getInsertedPhotos() + " photos inserted");
                } else {
                    failCount++;
                    System.out.println("   ⚠️ No photos inserted (may already exist or none found)");
                }
            } catch (Exception e) {
                failCount++;
                System.err.println("   ❌ Error: " + e.getMessage());
                e.printStackTrace();
            }
        }

        // Print summary
        System.out.println();
        System.out.println("╔══════════════════════════════════════════════════════════════════╗");
        System.out.println("║                    🎉 SEED COMPLETE!                             ║");
        System.out.println("╚══════════════════════════════════════════════════════════════════╝");
        System.out.println();
        System.out.println("📊 Summary:");
        System.out.println("   • Locations processed: " + targetLocations.size());
        System.out.println("   • Successful: " + successCount);
        System.out.println("   • Failed/Empty: " + failCount);
        System.out.println("   • Total photos attempted: " + totalPhotosAttempted);
        System.out.println("   • Total photos inserted: " + totalPhotosInserted);
        System.out.println("   • Conflict-skipped (existing): " + totalConflictSkipped);
        System.out.println("   • Failed inserts (exceptions): " + totalFailedInsert);
        System.out.println("   • Landmark spots upserted: " + totalLandmarks);
        System.out.println("   • Hotspot spots upserted: " + totalHotspots);
        System.out.println("   • Skipped (missing geo): " + totalMissingGeo);
        System.out.println("   • Skipped (missing url/quality): " + totalMissingUrl);
        System.out.println("   • Skipped (duplicates): " + totalDuplicates);
        System.out.println();
        System.out.println("📍 Results by location:");
        for (SeedResult result : results) {
            String status = result.getInsertedPhotos() > 0 ? "✅" : "⚠️";
            System.out.println("   " + status + " " + result.getLocationName() + 
                ": " + result.getFilteredPhotos() + " filtered, " + result.getPhotosAttempted() + " attempted, " + result.getInsertedPhotos() + " inserted, " + result.getConflictSkipped() + " conflict-skipped, " + result.getFailedInsert() + " failed (landmarks: " +
                result.getLandmarkUpserts() + ", hotspots: " + result.getHotspotUpserts() + ")");
        }
        System.out.println();
        System.out.println("✨ Seed finished, press Ctrl+C to exit.");
    }

    private List<TargetLocation> loadTargetLocations() {
        try (InputStream is = new ClassPathResource("seed/locations.json").getInputStream()) {
            ObjectMapper mapper = new ObjectMapper();
            return mapper.readValue(is, new TypeReference<List<TargetLocation>>() {});
        } catch (Exception ex) {
            System.err.println("⚠️  Failed to load locations.json, falling back to empty list: " + ex.getMessage());
            return new ArrayList<>();
        }
    }

    private List<AreaConfig> loadAreas() {
        try (InputStream is = new ClassPathResource("seed/areas.json").getInputStream()) {
            ObjectMapper mapper = new ObjectMapper();
            return mapper.readValue(is, new TypeReference<List<AreaConfig>>() {});
        } catch (Exception ex) {
            System.err.println("⚠️  Failed to load areas.json, falling back to empty list: " + ex.getMessage());
            return new ArrayList<>();
        }
    }

    private void resetSeedData() {
        jdbcTemplate.execute("TRUNCATE photos RESTART IDENTITY;");
        jdbcTemplate.execute("TRUNCATE spots RESTART IDENTITY CASCADE;");
    }
}
