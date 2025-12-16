package com.photospots;

import java.util.List;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import com.photospots.service.FlickrSeedService;
import com.photospots.service.Hotspot;
import com.photospots.service.Landmark;

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

        try {
            System.out.println("\n🚀 STEP 1-4: Full Seed Pipeline\n");

            // Coordinates for London (example from Express script)
            double lat = 43.653908;
            double lng = -79.384293;
            int radiusKm = 1;

            System.out.println("=== STEP 1: Fetching from Flickr ===");
            var photos = flickrSeedService.fetchFlickrPhotos(lat, lng, radiusKm);
            System.out.println("✅ Fetched " + photos.size() + " photos\n");

            System.out.println("=== STEP 2: Identifying Landmarks ===");
            var landmarks = flickrSeedService.identifyLandmarks(photos, 15);
            System.out.println("✅ Identified " + landmarks.size() + " landmarks");
            if (!landmarks.isEmpty()) {
                StringBuilder sb = new StringBuilder("   📍 ");
                for (int i = 0; i < landmarks.size(); i++) {
                    Landmark l = landmarks.get(i);
                    if (i > 0) sb.append(", ");
                    sb.append(l.getName()).append(" (").append(l.getPhotoCount()).append(")");
                }
                System.out.println(sb.append("\n"));
            } else {
                System.out.println();
            }

            if (landmarks.isEmpty()) {
                System.out.println("⚠️  No landmarks found");
                return;
            }

            System.out.println("=== STEP 3: Grouping into Hotspots ===");
            int hotspotsCount = 0;
            for (Landmark landmark : landmarks) {
                hotspotsCount += flickrSeedService.groupPhotosIntoHotspots(landmark, 3).size();
            }
            System.out.println("✅ Found hotspots\n");

            System.out.println("=== STEP 4: Inserting into Database ===");
            int totalLandmarks = 0;
            int totalHotspots = 0;
            int totalPhotos = 0;

            for (Landmark landmark : landmarks) {
                List<Hotspot> hotspots = flickrSeedService.groupPhotosIntoHotspots(landmark, 3);
                if (hotspots.isEmpty()) {
                    continue;
                }

                try {
                    flickrSeedService.insertLandmarkAndHotspots(landmark, hotspots);
                    totalLandmarks++;
                    totalHotspots += hotspots.size();
                    for (Hotspot hotspot : hotspots) {
                        totalPhotos += hotspot.getPhotos().size();
                    }
                } catch (Exception e) {
                    System.err.println("⚠️  Skipped " + landmark.getName() + ": " + e.getMessage());
                    e.printStackTrace();
                }
            }

            System.out.println("\n========== 🎉 COMPLETE! ==========");
            System.out.println("✅ STEP 1: Fetched " + photos.size() + " photos");
            System.out.println("✅ STEP 2: Identified " + landmarks.size() + " landmarks");
            System.out.println("✅ STEP 3: Found hotspots");
            System.out.println("✅ STEP 4: Database insertion complete");
            System.out.println("Database Summary: " + totalLandmarks + " landmarks, " + totalHotspots + 
                " hotspots, " + totalPhotos + " photos");
            System.out.println("\n✨ Done!");

        } catch (Exception e) {
            System.err.println("\n❌ Seed failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
