import Foundation

class APIService {
    static let shared = APIService()
    private let baseURL = "http://localhost:3000/api" // Adjust based on actual backend URL
    
    func fetchSpots() async throws -> [Spot] {
        guard let url = URL(string: "\(baseURL)/spots") else {
            throw URLError(.badURL)
        }
        
        let (data, _) = try await URLSession.shared.data(from: url)
        let spots = try JSONDecoder().decode([Spot].self, from: data)
        return spots
    }
}
