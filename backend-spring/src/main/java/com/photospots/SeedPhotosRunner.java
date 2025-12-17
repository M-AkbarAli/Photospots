package com.photospots;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

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

    public SeedPhotosRunner(FlickrSeedService flickrSeedService) {
        this.flickrSeedService = flickrSeedService;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        // Check if seed argument is passed, otherwise skip
        if (!args.containsOption("seed")) {
            return;
        }

        System.out.println("\n");
        System.out.println("╔══════════════════════════════════════════════════════════════════╗");
        System.out.println("║           🌍 FLICKR PHOTO SPOT SEED SCRIPT                       ║");
        System.out.println("║   Following seedscript.md strategy for photo spot population     ║");
        System.out.println("╚══════════════════════════════════════════════════════════════════╝");
        System.out.println();

        // Define target locations (from seedscript.md examples)
        List<TargetLocation> targetLocations = getTargetLocations();

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
        System.out.println();
        System.out.println("📍 Results by location:");
        for (SeedResult result : results) {
            String status = result.getInsertedPhotos() > 0 ? "✅" : "⚠️";
            System.out.println("   " + status + " " + result.getLocationName() + 
                ": " + result.getTotalPhotos() + " found, " + result.getInsertedPhotos() + " inserted");
        }
        System.out.println();
        System.out.println("✨ Seed script finished! Press Ctrl+C to exit.");
    }

    /**
     * Define the list of target locations to seed.
     * These are popular photo spots in the GTA (Greater Toronto Area).
     * 
     * Each location has:
     * - Name: The place name for text search
     * - Latitude/Longitude: For geo filtering
     * - Radius: Search radius in km
     * - Alternate names: Additional search terms (optional)
     */
    private List<TargetLocation> getTargetLocations() {
        List<TargetLocation> locations = new ArrayList<>();

        // Scarborough area (from seedscript.md examples)
        locations.add(new TargetLocation("Scarborough Town Centre", 43.7762, -79.2578, 0.5, "STC"));
        locations.add(new TargetLocation("Albert Campbell Square", 43.7716, -79.2510, 0.3));
        locations.add(new TargetLocation("Scarborough Bluffs", 43.7110, -79.2340, 1.0, "Bluffs Park", "Scarborough Bluffs Park"));
        locations.add(new TargetLocation("Bluffer's Park", 43.7070, -79.2290, 0.5));
        locations.add(new TargetLocation("Rouge Beach", 43.7970, -79.1180, 0.5, "Rouge Beach Park"));
        locations.add(new TargetLocation("Guild Park and Gardens", 43.7440, -79.1960, 0.5, "Guild Inn"));

        // Downtown Toronto landmarks
        locations.add(new TargetLocation("CN Tower", 43.6426, -79.3871, 0.3));
        locations.add(new TargetLocation("Toronto City Hall", 43.6534, -79.3841, 0.3, "Nathan Phillips Square"));
        locations.add(new TargetLocation("Distillery District", 43.6503, -79.3596, 0.4));
        locations.add(new TargetLocation("St. Lawrence Market", 43.6488, -79.3716, 0.3));
        locations.add(new TargetLocation("Kensington Market", 43.6547, -79.4006, 0.4));
        locations.add(new TargetLocation("Graffiti Alley Toronto", 43.6476, -79.4001, 0.2, "Rush Lane"));

        // Parks
        locations.add(new TargetLocation("High Park Toronto", 43.6465, -79.4637, 1.0, "High Park"));
        locations.add(new TargetLocation("Trinity Bellwoods Park", 43.6467, -79.4183, 0.4));
        locations.add(new TargetLocation("Toronto Islands", 43.6205, -79.3778, 1.5, "Centre Island", "Ward's Island"));
        locations.add(new TargetLocation("Riverdale Park", 43.6685, -79.3570, 0.5));
        locations.add(new TargetLocation("Evergreen Brick Works", 43.6847, -79.3650, 0.4));

        // Waterfront
        locations.add(new TargetLocation("Harbourfront Toronto", 43.6389, -79.3814, 0.5));
        locations.add(new TargetLocation("Sugar Beach Toronto", 43.6432, -79.3654, 0.3, "Sugar Beach"));
        locations.add(new TargetLocation("Polson Pier", 43.6378, -79.3492, 0.3));

        // Cultural & Historic
        locations.add(new TargetLocation("Royal Ontario Museum", 43.6677, -79.3948, 0.3, "ROM Toronto"));
        locations.add(new TargetLocation("Art Gallery of Ontario", 43.6536, -79.3925, 0.3, "AGO Toronto"));
        locations.add(new TargetLocation("Casa Loma", 43.6780, -79.4094, 0.3));
        locations.add(new TargetLocation("Union Station Toronto", 43.6453, -79.3806, 0.3));

        // Neighborhoods with character
        locations.add(new TargetLocation("Queen Street West Toronto", 43.6487, -79.4127, 0.5));
        locations.add(new TargetLocation("Yorkville Toronto", 43.6704, -79.3929, 0.4));
        locations.add(new TargetLocation("Chinatown Toronto", 43.6524, -79.3984, 0.4));

        return locations;
    }
}
