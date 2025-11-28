import SwiftUI

struct TabTwoView: View {
    var body: some View {
        VStack {
            Text("Tab Two")
                .font(.largeTitle)
                .fontWeight(.bold)
            Text("Time to learn coding")
                .padding()
            
            Divider()
                .padding(.vertical)
            
            Text("This is a placeholder for the second tab.")
                .foregroundColor(.secondary)
        }
    }
}
