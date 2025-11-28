# How to Run the Photospots iOS App

Since this project was generated as a collection of Swift files, you need to set up an Xcode project to run it.

## Steps

1.  **Open Xcode**.
2.  Select **"Create a new Xcode project"**.
3.  Choose **"App"** under the iOS tab and click **Next**.
4.  Enter the following details:
    *   **Product Name**: Photospots
    *   **Interface**: SwiftUI
    *   **Language**: Swift
5.  Save the project in a location of your choice (e.g., next to this `ios-app` folder).
6.  **Import the Files**:
    *   Delete the default `ContentView.swift` and `PhotospotsApp.swift` created by Xcode.
    *   Drag and drop the contents of the `ios-app` folder (Models, Views, ViewModels, Services, etc.) into your new Xcode project navigator.
    *   Make sure **"Copy items if needed"** is checked.
7.  **Run the App**:
    *   Select a simulator (e.g., iPhone 15) from the top bar.
    *   Press **Command + R** or click the **Play** button.

## Note on Map Permissions
The app uses `CLLocationManager`. You will need to add the following key to your `Info.plist` file in Xcode to request location permissions:
*   **Key**: `Privacy - Location When In Use Usage Description`
*   **Value**: "We need your location to show spots near you."
