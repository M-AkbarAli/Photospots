package com.photospots.controller;

import com.photospots.dto.ApiResponse;
import com.photospots.dto.PhotoDto;
import com.photospots.dto.SpotDto;
import com.photospots.service.SpotService;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/spots")
@Validated
public class SpotController {

    private final SpotService spotService;

    public SpotController(SpotService spotService) {
        this.spotService = spotService;
    }

    @GetMapping("/nearby")
    public ResponseEntity<?> getNearby(
        @RequestParam("lat") double latitude,
        @RequestParam("lng") double longitude,
        @RequestParam(value = "radiusMeters", defaultValue = "1500") double radiusMeters
    ) {
        List<SpotDto> spots = spotService.nearby(latitude, longitude, radiusMeters);
        return ResponseEntity.ok(ApiResponse.ok(spots, spots.size()));
    }

    @GetMapping("/search")
    public ResponseEntity<?> search(
        @RequestParam("q") String query,
        @RequestParam(value = "lat", required = false) Double latitude,
        @RequestParam(value = "lng", required = false) Double longitude
    ) {
        List<SpotDto> spots = spotService.search(query, latitude, longitude);
        return ResponseEntity.ok(ApiResponse.ok(spots, spots.size()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable("id") UUID id) {
        Optional<SpotDto> result = spotService.getById(id);
        return result.<ResponseEntity<?>>map(s -> ResponseEntity.ok(ApiResponse.ok(s)))
            .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("Spot not found", null)));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody @NotNull SpotDto request) {
        SpotDto created = spotService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(created));
    }

    @GetMapping("/{landmarkId}/hotspots")
    public ResponseEntity<?> hotspots(@PathVariable("landmarkId") UUID landmarkId) {
        List<SpotDto> hotspots = spotService.hotspotsForLandmark(landmarkId);
        return ResponseEntity.ok(ApiResponse.ok(hotspots, hotspots.size()));
    }

    @GetMapping("/{spotId}/photos")
    public ResponseEntity<?> photos(@PathVariable("spotId") UUID spotId) {
        List<PhotoDto> photos = spotService.photosForSpot(spotId);
        return ResponseEntity.ok(ApiResponse.ok(photos, photos.size()));
    }
}
