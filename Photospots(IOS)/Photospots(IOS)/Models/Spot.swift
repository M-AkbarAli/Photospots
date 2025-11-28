import Foundation
import CoreLocation

struct Spot: Identifiable, Codable {
    let id: String
    let name: String
    let lat: Double
    let lng: Double
    let source: String // Using String for simplicity, can be enum later
    let categories: [String]?
    let score: Double
    let photoUrl: String?
    let description: String?
    let lastEnrichedAt: String?
    let createdAt: String
    let updatedAt: String
    
    enum CodingKeys: String, CodingKey {
        case id, name, lat, lng, source, categories, score
        case photoUrl = "photo_url"
        case description
        case lastEnrichedAt = "last_enriched_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
    
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}
