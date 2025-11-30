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
            
            Text("This is a SIMGA to see if this makes a difference!")
                .foregroundColor(.secondary)
        }
    }
}
