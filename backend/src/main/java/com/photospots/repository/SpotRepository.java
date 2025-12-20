package com.photospots.repository;

import com.photospots.model.Spot;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpotRepository extends JpaRepository<Spot, UUID> {
    // TODO: add geospatial queries (nearby/search) using PostGIS functions
}
