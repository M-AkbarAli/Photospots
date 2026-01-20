# App Store Submission Checklist

Quick reference checklist for App Store submission.

## 🔴 Critical - Must Fix Before Submission

- [ ] **Change Bundle Identifier**
  - Current: `com.anonymous.Photospots` ❌
  - Change to: `com.yourname.photospots` or `com.yourcompany.photospots`
  - Location: `frontend/app.json` → `expo.ios.bundleIdentifier`

- [ ] **Add Build Number**
  - Add `"buildNumber": "1"` to `expo.ios` in `app.json`

- [ ] **Add Encryption Declaration**
  - Add `"ITSAppUsesNonExemptEncryption": false` to `infoPlist`

- [ ] **Apple Developer Account**
  - Sign up at https://developer.apple.com/programs/
  - Cost: $99/year
  - Required for App Store submission

## 🟡 Important - Required for Submission

- [ ] **Privacy Policy URL**
  - Must be publicly accessible
  - Required by Apple
  - Add to App Store Connect

- [ ] **Support URL**
  - Must be publicly accessible
  - Required by Apple
  - Add to App Store Connect

- [ ] **App Screenshots**
  - Minimum: 1 per device size
  - Recommended: 3-10 per device size
  - Sizes needed:
    - iPhone 6.7": 1290 x 2796
    - iPhone 6.5": 1242 x 2688
    - iPhone 5.5": 1242 x 2208
    - iPad Pro 12.9": 2048 x 2732

- [ ] **App Icon**
  - Size: 1024 x 1024 pixels
  - Format: PNG or JPEG
  - No transparency
  - High quality

- [ ] **App Description**
  - Up to 4000 characters
  - Describe features and functionality
  - Clear and engaging

- [ ] **Keywords**
  - Up to 100 characters
  - Comma-separated
  - Relevant to your app

## 🟢 Recommended - Best Practices

- [ ] **App Preview Video**
  - 15-30 seconds
  - Shows key features
  - High quality

- [ ] **Promotional Text**
  - Up to 170 characters
  - Can update without new version
  - Marketing message

- [ ] **TestFlight Beta Testing**
  - Test with beta users first
  - Get feedback before public release
  - Free with Apple Developer account

- [ ] **Analytics Setup**
  - App Store Connect Analytics
  - Track downloads and usage
  - Free with App Store Connect

## 📋 Technical Setup

- [ ] **Install EAS CLI**
  ```bash
  npm install -g eas-cli
  ```

- [ ] **Login to Expo**
  ```bash
  eas login
  ```

- [ ] **Configure EAS Build**
  ```bash
  cd frontend
  eas build:configure
  ```

- [ ] **Create App ID in Apple Developer Portal**
  - Match bundle identifier
  - Enable required capabilities

- [ ] **Create App in App Store Connect**
  - Fill all required information
  - Upload screenshots
  - Set pricing

## 🧪 Testing

- [ ] **Test on Physical Device**
  - Not just simulator
  - Test all features
  - Check location permissions

- [ ] **Test on Multiple iOS Versions**
  - Minimum: iOS 15.1
  - Test on latest iOS
  - Ensure compatibility

- [ ] **Test on iPad** (if supportsTablet: true)
  - Verify layout works
  - Test all features
  - Check orientation support

- [ ] **No Crashes**
  - App launches successfully
  - All features work
  - No placeholder content

## 📝 Content Requirements

- [ ] **Complete App Information**
  - Name, subtitle, description
  - Category selection
  - Age rating

- [ ] **Privacy Information**
  - Data collection types
  - Purpose of data use
  - Linked to user: No
  - Used for tracking: No

- [ ] **Legal Information**
  - Copyright notice
  - Terms of service (if applicable)
  - Privacy policy accessible

## 🚀 Submission

- [ ] **Build Production Version**
  ```bash
  eas build --platform ios --profile production
  ```

- [ ] **Submit to App Store**
  ```bash
  eas submit --platform ios --latest
  ```

- [ ] **Monitor Review Status**
  - Check App Store Connect
  - Respond to any questions
  - Fix issues if rejected

## 💰 Budget Planning

- **Apple Developer Program**: $99/year (required)
- **EAS Build**: Free tier (30 builds/month) or $29+/month
- **Total Minimum**: $99/year

## ⏱️ Timeline Estimate

- **Apple Developer Signup**: 1-2 days (approval)
- **App Store Connect Setup**: 1-2 hours
- **Asset Preparation**: 2-4 hours (screenshots, descriptions)
- **Build Process**: 15-30 minutes per build
- **App Review**: 24-48 hours (typical)
- **Total**: ~1 week from start to approval

## 🆘 If Rejected

1. Read rejection reasons carefully
2. Fix all mentioned issues
3. Update app version/build number
4. Rebuild and resubmit
5. No additional cost for resubmission

---

**Next Steps**: Start with the Critical items, then work through Important and Recommended items.

