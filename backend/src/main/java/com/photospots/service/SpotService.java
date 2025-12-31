package com.photospots.service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.postgresql.util.PGobject;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.photospots.config.AppProperties;
import com.photospots.dto.PhotoDto;
import com.photospots.dto.SpotDto;
import com.photospots.model.Spot;
import com.photospots.repository.SpotRepository;
import com.photospots.util.GeoValidator;

@Service
public class SpotService {

    private class SpotRowMapper implements RowMapper<SpotDto> {
        @Override
        public SpotDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            SpotDto dto = new SpotDto();
            String id = rs.getString("id");
            if (id != null) {
                dto.setId(UUID.fromString(id));
            }
            dto.setName(rs.getString("name"));
            dto.setDescription(rs.getString("description"));
            dto.setLatitude(rs.getDouble("lat"));
            dto.setLongitude(rs.getDouble("lng"));
            dto.setScore(rs.getObject("score") != null ? rs.getDouble("score") : null);
            Object distance = rs.getObject("distance_m");
            if (distance != null) {
                dto.setDistanceMeters(rs.getDouble("distance_m"));
            }
            dto.setPhotoUrl(rs.getString("photo_url"));
            java.sql.Array categories = rs.getArray("categories");
            if (categories != null) {
                String[] arr = (String[]) categories.getArray();
                dto.setCategories(Arrays.asList(arr));
            }
            return dto;
        }
    }
    private class PhotoRowMapper implements RowMapper<PhotoDto> {
        @Override
        public PhotoDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            PhotoDto dto = new PhotoDto();
            dto.setId(rs.getString("id"));
            dto.setSpotId(rs.getString("spot_id"));
            Object variants = rs.getObject("variants");
            if (variants instanceof PGobject pg && pg.getValue() != null) {
                try {
                    Map<String, Object> map = objectMapper.readValue(pg.getValue(), new TypeReference<Map<String, Object>>() {
                    });
                    dto.setVariants(map);
                } catch (Exception ignored) {
                }
            }
            Object created = rs.getObject("created_at");
            if (created instanceof OffsetDateTime odt) {
                dto.setCreatedAt(odt);
            }
            return dto;
        }
    }
    private final SpotRepository spotRepository;
    private final JdbcTemplate jdbcTemplate;
    private final CacheService cacheService;
    private final AppProperties appProperties;

    private final ObjectMapper objectMapper;

    private final GeometryFactory geometryFactory = new GeometryFactory();

    public SpotService(
        SpotRepository spotRepository,
        JdbcTemplate jdbcTemplate,
        CacheService cacheService,
        AppProperties appProperties,
        ObjectMapper objectMapper
    ) {
        this.spotRepository = spotRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.cacheService = cacheService;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Optional<SpotDto> getById(UUID id) {
        String cacheKey = "spot:" + id;
        Optional<SpotDto> cached = cacheService.get(cacheKey, SpotDto.class);
        if (cached.isPresent()) {
            return cached;
        }

        Optional<SpotDto> result = spotRepository.findById(id).map(this::toDto);
        result.ifPresent(dto -> cacheService.set(cacheKey, dto, Duration.ofSeconds(appProperties.getCache().getSpotSeconds())));
        return result;
    }

    @Transactional
    public SpotDto create(SpotDto request) {
        if (!GeoValidator.isValidCoordinate(request.getLatitude(), request.getLongitude())) {
            throw new IllegalArgumentException("lat must be between -90 and 90, lng between -180 and 180");
        }
        Spot spot = new Spot();
        spot.setName(request.getName());
        spot.setDescription(request.getDescription());
        spot.setCategories(request.getCategories());
        Point point = geometryFactory.createPoint(new Coordinate(request.getLongitude(), request.getLatitude()));
        point.setSRID(4326);
        spot.setLocation(point);
        spot.setLat(request.getLatitude());
        spot.setLng(request.getLongitude());
        spot.setScore(request.getScore());
        Spot saved = spotRepository.save(spot);
        return toDto(saved);
    }

    @Transactional(readOnly = true)
    public List<SpotDto> nearby(double lat, double lng, double radiusMeters) {
        if (!GeoValidator.isValidCoordinate(lat, lng)) {
            throw new IllegalArgumentException("lat must be between -90 and 90, lng between -180 and 180");
        }
        if (radiusMeters < 100 || radiusMeters > 50000) {
            throw new IllegalArgumentException("radius must be between 100 and 50000 meters");
        }

        String cacheKey = String.format("nearby:%.2f:%.2f:%.0f", Math.floor(lat * 100) / 100, Math.floor(lng * 100) / 100, radiusMeters);
        Optional<List> cached = cacheService.get(cacheKey, List.class);
        if (cached.isPresent()) {
            return cached.get();
        }

        String sql = "select * from api_spots_nearby(?, ?, ?, ?)";
        List<SpotDto> spots = jdbcTemplate.query(sql, new Object[]{lat, lng, radiusMeters, 200}, new SpotRowMapper());
        cacheService.set(cacheKey, spots, Duration.ofSeconds(appProperties.getCache().getNearbySeconds()));
        return spots;
    }

    @Transactional(readOnly = true)
    public List<SpotDto> search(String query, Double lat, Double lng) {
        if (query == null || query.trim().length() < 2) {
            throw new IllegalArgumentException("Search query must be at least 2 characters");
        }
        if ((lat != null && lng == null) || (lat == null && lng != null)) {
            throw new IllegalArgumentException("Both lat and lng must be provided together");
        }
        if (lat != null && lng != null && !GeoValidator.isValidCoordinate(lat, lng)) {
            throw new IllegalArgumentException("lat must be between -90 and 90, lng between -180 and 180");
        }

        String cacheKey = buildSearchCacheKey(query, lat, lng);
        Optional<List> cached = cacheService.get(cacheKey, List.class);
        if (cached.isPresent()) {
            return cached.get();
        }

        String sql = "select * from api_spots_search(?, ?, ?, ?)";
        List<SpotDto> spots = jdbcTemplate.query(sql, new Object[]{query, lat, lng, 50}, new SpotRowMapper());
        cacheService.set(cacheKey, spots, Duration.ofSeconds(appProperties.getCache().getSearchSeconds()));
        return spots;
    }

    @Transactional(readOnly = true)
    public List<SpotDto> hotspotsForLandmark(UUID landmarkId) {
        // Deprecated: hotspots are no longer used. Return empty list.
        String cacheKey = "hotspots:" + landmarkId;
        List<SpotDto> emptyList = new ArrayList<>();
        cacheService.set(cacheKey, emptyList, Duration.ofSeconds(appProperties.getCache().getHotspotsSeconds()));
        return emptyList;
    }

    @Transactional(readOnly = true)
    public List<PhotoDto> photosForSpot(UUID spotId) {
        String cacheKey = "photos:" + spotId;
        Optional<List> cached = cacheService.get(cacheKey, List.class);
        if (cached.isPresent()) {
            return cached.get();
        }

        String sql = "select id, spot_id, variants, created_at from photos where spot_id = ? and visibility = 'public' order by created_at desc";
        List<PhotoDto> photos = jdbcTemplate.query(sql, new Object[]{spotId}, new PhotoRowMapper());
        cacheService.set(cacheKey, photos, Duration.ofSeconds(appProperties.getCache().getPhotosSeconds()));
        return photos;
    }

    private String buildSearchCacheKey(String query, Double lat, Double lng) {
        StringBuilder key = new StringBuilder("search:" + query.trim().toLowerCase());
        if (lat != null && lng != null) {
            key.append(":").append(Math.floor(lat * 10)).append(":").append(Math.floor(lng * 10));
        }
        return key.toString();
    }

    private SpotDto toDto(Spot spot) {
        SpotDto dto = new SpotDto();
        dto.setId(spot.getId());
        dto.setName(spot.getName());
        dto.setDescription(spot.getDescription());
        dto.setCategories(spot.getCategories());
        dto.setScore(spot.getScore());
        if (spot.getLocation() != null) {
            dto.setLatitude(spot.getLocation().getY());
            dto.setLongitude(spot.getLocation().getX());
        } else {
            dto.setLatitude(spot.getLat() != null ? spot.getLat() : 0);
            dto.setLongitude(spot.getLng() != null ? spot.getLng() : 0);
        }
        return dto;
    }
}
