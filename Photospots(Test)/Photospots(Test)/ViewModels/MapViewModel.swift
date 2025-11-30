import Foundation
import MapKit
import CoreLocation
import SwiftUI
import Combine

@MainActor
class MapViewModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 43.6532, longitude: -79.3832), // Default to Toronto
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
    )
    @Published var spots: [Spot] = []
    
    @Published var userLocation: CLLocation?
    
    private let locationManager = CLLocationManager()
    
    override init() {
        super.init()
        setupLocationManager()
        
        Task {
            await loadSpots()
        }
    }
    
    private func setupLocationManager() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()
    }
    
    func loadSpots() async {
        do {
            let fetchedSpots = try await APIService.shared.fetchSpots()
            self.spots = fetchedSpots
            sortSpotsByDistance()
        } catch {
            print("Error fetching spots: \(error)")
        }
    }
    
    private func sortSpotsByDistance() {
        guard let userLocation = userLocation else { return }
        spots.sort { spot1, spot2 in
            let loc1 = CLLocation(latitude: spot1.lat, longitude: spot1.lng)
            let loc2 = CLLocation(latitude: spot2.lat, longitude: spot2.lng)
            return userLocation.distance(from: loc1) < userLocation.distance(from: loc2)
        }
    }
    
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            self.userLocation = location
            self.region = MKCoordinateRegion(
                center: location.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
            )
            self.sortSpotsByDistance()
        }
    }
}
