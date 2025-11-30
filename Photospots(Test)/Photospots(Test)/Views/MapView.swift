import SwiftUI
import MapKit

struct MapView: View {
    @StateObject private var viewModel = MapViewModel()
    
    var body: some View {
        ZStack(alignment: .bottom) {
            Map(coordinateRegion: $viewModel.region,
                interactionModes: .all,
                showsUserLocation: true,
                annotationItems: viewModel.spots) { spot in
                MapAnnotation(coordinate: spot.coordinate) {
                    Image(systemName: "camera.fill")
                        .foregroundColor(.red)
                        .background(Circle().fill(Color.white))
                        .scaleEffect(1.5)
                }
            }
            .edgesIgnoringSafeArea(.all)
            
            BottomSheetView(viewModel: viewModel)
                .edgesIgnoringSafeArea(.bottom)
        }
    }
}
