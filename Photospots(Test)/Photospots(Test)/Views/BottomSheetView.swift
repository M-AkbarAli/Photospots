import SwiftUI

struct BottomSheetView: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var offset: CGFloat = 0
    @State private var isExpanded = false
    
    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                // Drag Handle
                Capsule()
                    .fill(Color.gray.opacity(0.5))
                    .frame(width: 40, height: 5)
                    .padding(.top, 10)
                    .padding(.bottom, 10)
                
                // Header
                HStack {
                    Text("Good morning, User") // Placeholder for now
                        .font(.title2)
                        .fontWeight(.bold)
                    Spacer()
                    Image(systemName: "person.circle.fill")
                        .resizable()
                        .frame(width: 30, height: 30)
                        .foregroundColor(.gray)
                }
                .padding(.horizontal)
                .padding(.bottom, 10)
                
                // Search Bar Placeholder
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    Text("Where to?")
                        .foregroundColor(.gray)
                    Spacer()
                }
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)
                .padding(.horizontal)
                .padding(.bottom, 20)
                
                // List of Spots
                ScrollView {
                    LazyVStack(spacing: 20) {
                        ForEach(viewModel.spots) { spot in
                            HStack(spacing: 15) {
                                // Icon/Image
                                Circle()
                                    .fill(Color.blue.opacity(0.1))
                                    .frame(width: 50, height: 50)
                                    .overlay(
                                        Image(systemName: "camera.fill")
                                            .foregroundColor(.blue)
                                    )
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(spot.name)
                                        .font(.headline)
                                    Text(spot.description ?? "No description")
                                        .font(.subheadline)
                                        .foregroundColor(.gray)
                                        .lineLimit(1)
                                }
                                Spacer()
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.top, 10)
                }
            }
            .background(Color.white)
            .clipShape(TopRoundedRectangle(radius: 20))
            .shadow(radius: 10)
            .frame(height: geometry.size.height * 0.8) // Max height
            .offset(y: max(geometry.size.height * 0.4 + offset, geometry.size.height * 0.1)) // Min height (collapsed) vs Max (expanded) logic needs refinement, simplified for now
            .gesture(
                DragGesture()
                    .onChanged { value in
                        offset = value.translation.height
                    }
                    .onEnded { value in
                        // Snap logic would go here
                        withAnimation {
                            if offset < -100 {
                                offset = -geometry.size.height * 0.3
                            } else {
                                offset = 0
                            }
                        }
                    }
            )
        }
    }
}

struct TopRoundedRectangle: Shape {
    var radius: CGFloat
    
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height
        let r = min(min(radius, h/2), w/2)
        
        path.move(to: CGPoint(x: w, y: h))
        path.addLine(to: CGPoint(x: 0, y: h))
        path.addLine(to: CGPoint(x: 0, y: r))
        path.addRelativeArc(center: CGPoint(x: r, y: r), radius: r, startAngle: .degrees(180), delta: .degrees(90))
        path.addLine(to: CGPoint(x: w - r, y: 0))
        path.addRelativeArc(center: CGPoint(x: w - r, y: r), radius: r, startAngle: .degrees(270), delta: .degrees(90))
        path.closeSubpath()
        
        return path
    }
}
