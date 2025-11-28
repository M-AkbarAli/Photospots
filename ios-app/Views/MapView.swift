import SwiftUI
import MapKit

struct MapView: View {
    @StateObject private var viewModel = MapViewModel()
    
    var body: some View {
        Map(coordinateRegion: $viewModel.region,
            interactionModes: .all,
            showsUserLocation: true,
            annotationItems: viewModel.spots) { spot in
            MapAnnotation(coordinate: spot.coordinate) {
                VStack {
                    Image(systemName: "camera.fill")
                        .foregroundColor(.red)
                        .background(Circle().fill(Color.white))
                    Text(spot.name)
                        .font(.caption)
                        .padding(4)
                        .background(Color.white.opacity(0.8))
                        .cornerRadius(4)
                }
            }
        }
        .edgesIgnoringSafeArea(.top)
    }
}
