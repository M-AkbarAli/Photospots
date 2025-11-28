import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            MapView()
                .tabItem {
                    Label("Map", systemImage: "map")
                }
            
            TabTwoView()
                .tabItem {
                    Label("Tab Two", systemImage: "code")
                }
        }
    }
}
