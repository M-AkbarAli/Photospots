package com.photospots;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    public SeedPhotosRunner(FlickrSeedService flickrSeedService, JdbcTemplate jdbcTemplate) {
        this.flickrSeedService = flickrSeedService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        // Check if seed argument is passed, otherwise skip
        if (!args.containsOption("seed")) {
            return;
        }

        boolean resetMode = args.containsOption("seed-reset");
        if (resetMode) {
            System.out.println("⚠️  Reset mode enabled: truncating spots and photos...");
            resetSeedData();
        }

        System.out.println("\n");
        System.out.println("╔══════════════════════════════════════════════════════════════════╗");
        System.out.println("║           🌍 FLICKR PHOTO SPOT SEED SCRIPT                       ║");
        System.out.println("║   Following seedscript.md strategy for photo spot population     ║");
        System.out.println("╚══════════════════════════════════════════════════════════════════╝");
        System.out.println();

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
        int totalLandmarks = 0;
        int totalHotspots = 0;
        int totalMissingGeo = 0;
        int totalMissingUrl = 0;
        int totalDuplicates = 0;
        int totalFailedInsert = 0;
        List<SeedResult> results = new ArrayList<>();

        for (int i = 0; i < targetLocations.size(); i++) {
            TargetLocation location = targetLocations.get(i);
            System.out.println();
            System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            System.out.println("📍 [" + (i + 1) + "/" + targetLocations.size() + "] Processing: " + location.getName());
            System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            try {
                SeedResult result = flickrSeedService.seedLocation(location);
                results.add(result);
                totalLandmarks += result.getLandmarkUpserts();
                totalHotspots += result.getHotspotUpserts();
                totalMissingGeo += result.getMissingGeo();
                totalMissingUrl += result.getMissingUrl();
                totalDuplicates += result.getDuplicateCount();
                totalFailedInsert += result.getFailedInsert();
                
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
        System.out.println("   • Total photos inserted: " + totalPhotosInserted);
        System.out.println("   • Landmark spots upserted: " + totalLandmarks);
        System.out.println("   • Hotspot spots upserted: " + totalHotspots);
        System.out.println("   • Skipped (missing geo): " + totalMissingGeo);
        System.out.println("   • Skipped (missing url/quality): " + totalMissingUrl);
        System.out.println("   • Skipped (duplicates): " + totalDuplicates);
        System.out.println("   • Failed inserts: " + totalFailedInsert);
        System.out.println();
        System.out.println("📍 Results by location:");
        for (SeedResult result : results) {
            String status = result.getInsertedPhotos() > 0 ? "✅" : "⚠️";
            System.out.println("   " + status + " " + result.getLocationName() + 
                ": " + result.getFilteredPhotos() + " filtered, " + result.getInsertedPhotos() + " inserted (landmarks: " +
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

    private void resetSeedData() {
        jdbcTemplate.execute("TRUNCATE photos RESTART IDENTITY;");
        jdbcTemplate.execute("TRUNCATE spots RESTART IDENTITY CASCADE;");
    }
}
