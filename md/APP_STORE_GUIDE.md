# Apple App Store Submission Guide

Complete guide to prepare and submit Photospots to the Apple App Store.

## 📋 Prerequisites

### 1. Apple Developer Account
- **Cost**: $99/year (individual) or $299/year (organization)
- **Sign up**: https://developer.apple.com/programs/
- **Required for**: Code signing, App Store distribution, TestFlight

### 2. Expo Account (Free)
- Sign up at https://expo.dev
- Required for EAS Build service

### 3. Required Tools
- Xcode 15+ (for local builds/testing)
- EAS CLI: `npm install -g eas-cli`
- CocoaPods (for iOS dependencies)

---

## 🔧 Step 1: Update App Configuration

### Fix Bundle Identifier

**Current**: `com.anonymous.Photospots` ❌  
**Needed**: `com.yourcompany.photospots` or `com.yourname.photospots` ✅

Update `app.json`:
```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourcompany.photospots"
    }
  }
}
```

**Important**: 
- Must be unique (reverse domain notation)
- Cannot be changed after first App Store submission
- Use your domain or name (e.g., `com.akbarali.photospots`)

### Update App Metadata

Update `app.json` with complete information:

```json
{
  "expo": {
    "name": "Photospots",
    "slug": "photospots",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourcompany.photospots",
      "buildNumber": "1",
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Photospots uses your location to show you nearby photogenic spots and landmarks on the map.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Photospots uses your location to show you nearby photogenic spots and landmarks on the map.",
        "ITSAppUsesNonExemptEncryption": false
      },
      "config": {
        "usesNonExemptEncryption": false
      }
    }
  }
}
```

### Add Privacy Information

Apple requires privacy manifests. Update `app.json`:

```json
{
  "expo": {
    "ios": {
      "privacyManifests": {
        "NSPrivacyAccessedAPITypes": [
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
            "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
          }
        ],
        "NSPrivacyCollectedDataTypes": [
          {
            "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeLocation",
            "NSPrivacyCollectedDataTypeLinked": false,
            "NSPrivacyCollectedDataTypeTracking": false,
            "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
          }
        ]
      }
    }
  }
}
```

---

## 🏗️ Step 2: Set Up EAS Build

### Install EAS CLI

```bash
npm install -g eas-cli
```

### Login to Expo

```bash
eas login
```

### Configure EAS

```bash
cd frontend
eas build:configure
```

This creates `eas.json`. Update it for App Store builds:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "bundleIdentifier": "com.yourcompany.photospots"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-email@example.com",
        "ascAppId": "your-app-store-connect-app-id",
        "appleTeamId": "your-team-id"
      }
    }
  }
}
```

---

## 🔐 Step 3: Apple Developer Setup

### 1. Create App ID in Apple Developer Portal

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Click "+" → "App IDs" → "App"
3. Enter:
   - **Description**: Photospots
   - **Bundle ID**: `com.yourcompany.photospots` (must match app.json)
   - **Capabilities**: 
     - ✅ Location Services
     - ✅ Maps (if using Apple Maps)
4. Register

### 2. Create Distribution Certificate

EAS Build can handle this automatically, or create manually:

1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click "+" → "Apple Distribution"
3. Follow instructions to create certificate
4. Download and install (or let EAS handle it)

### 3. Create Provisioning Profile

**For App Store Distribution:**
1. Go to https://developer.apple.com/account/resources/profiles/list
2. Click "+" → "App Store"
3. Select your App ID
4. Select your Distribution Certificate
5. Name it "Photospots App Store"
6. Download (or let EAS handle it)

---

## 📱 Step 4: App Store Connect Setup

### 1. Create App Record

1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - **Platform**: iOS
   - **Name**: Photospots
   - **Primary Language**: English
   - **Bundle ID**: Select the one you created
   - **SKU**: `photospots-001` (unique identifier)
   - **User Access**: Full Access
4. Create

### 2. Prepare App Information

You'll need to provide:

#### App Information
- **Name**: Photospots (max 30 characters)
- **Subtitle**: Discover photogenic locations (max 30 characters)
- **Category**: 
  - Primary: Travel
  - Secondary: Photo & Video
- **Privacy Policy URL**: (Required) Your website privacy policy
- **Support URL**: Your website support page

#### Pricing and Availability
- **Price**: Free or Paid
- **Availability**: All countries or specific regions

#### App Privacy
- **Data Collection**: 
  - Location Data (Coarse & Precise)
  - Purpose: App Functionality
  - Linked to User: No
  - Used for Tracking: No

---

## 🎨 Step 5: Prepare App Store Assets

### Required Screenshots

You need screenshots for:
- **iPhone 6.7" Display** (iPhone 14 Pro Max, 15 Pro Max): 1290 x 2796 pixels
- **iPhone 6.5" Display** (iPhone 11 Pro Max, XS Max): 1242 x 2688 pixels
- **iPhone 5.5" Display** (iPhone 8 Plus): 1242 x 2208 pixels
- **iPad Pro 12.9"**: 2048 x 2732 pixels

**Minimum**: 1 screenshot per device size  
**Recommended**: 3-10 screenshots per device size

### App Icon

- **Size**: 1024 x 1024 pixels
- **Format**: PNG or JPEG
- **No transparency**
- **No rounded corners** (Apple adds them)

### App Preview Video (Optional but Recommended)

- **Duration**: 15-30 seconds
- **Format**: MP4, MOV, or M4V
- **Resolution**: Match device screenshot sizes
- **Show**: Key features, user experience

### Other Assets Needed

- **App Description**: Up to 4000 characters
- **Keywords**: Up to 100 characters (comma-separated)
- **Promotional Text**: Up to 170 characters (can be updated without new version)
- **What's New**: Release notes for updates
- **Support URL**: Required
- **Marketing URL**: Optional
- **Copyright**: Your name or company

---

## 🔨 Step 6: Build for App Store

### Build Production Version

```bash
cd frontend
eas build --platform ios --profile production
```

This will:
1. Upload your code to Expo servers
2. Build the iOS app
3. Sign it with your certificates
4. Provide download link

**Build time**: ~15-30 minutes

### Alternative: Local Build (Advanced)

If you prefer building locally:

```bash
cd frontend
eas build --platform ios --profile production --local
```

Requires:
- Xcode installed
- Proper code signing setup
- More complex configuration

---

## 📤 Step 7: Submit to App Store

### Option 1: EAS Submit (Recommended)

```bash
cd frontend
eas submit --platform ios --latest
```

This will:
1. Upload your build to App Store Connect
2. Handle all the technical submission steps

### Option 2: Manual Submission via App Store Connect

1. Go to App Store Connect → Your App
2. Click "+ Version or Platform" → iOS
3. Fill in version information
4. Under "Build", click "+" and select your uploaded build
5. Complete all required information
6. Submit for Review

---

## ✅ Step 8: App Review Checklist

Before submitting, ensure:

### Technical Requirements
- [ ] App launches without crashes
- [ ] All features work as described
- [ ] No placeholder content
- [ ] Privacy policy URL is accessible
- [ ] Support URL is accessible
- [ ] App works on minimum iOS version (iOS 15.1+)
- [ ] App works on iPhone and iPad (if supportsTablet: true)
- [ ] Location permissions properly requested
- [ ] No broken links or features

### Content Requirements
- [ ] App description is complete and accurate
- [ ] Screenshots show actual app functionality
- [ ] App icon is high quality (1024x1024)
- [ ] Keywords are relevant
- [ ] Age rating is appropriate
- [ ] Privacy information is accurate

### Legal Requirements
- [ ] Privacy policy is published and linked
- [ ] Terms of service (if applicable)
- [ ] Copyright information is correct
- [ ] No copyrighted content without permission
- [ ] Mapbox attribution (if required by Mapbox terms)

### Mapbox Specific
- [ ] Mapbox terms of service compliance
- [ ] Proper attribution (if required)
- [ ] API usage within limits

---

## 🚨 Common Rejection Reasons

### 1. Missing Privacy Policy
- **Fix**: Add privacy policy URL in App Store Connect

### 2. Location Permission Not Explained
- **Fix**: Ensure `NSLocationWhenInUseUsageDescription` is clear

### 3. App Crashes on Launch
- **Fix**: Test thoroughly on physical devices before submission

### 4. Incomplete Information
- **Fix**: Fill all required fields in App Store Connect

### 5. Misleading Functionality
- **Fix**: Ensure app does what description says

### 6. Missing Support Information
- **Fix**: Provide valid support URL

### 7. Encryption Compliance
- **Fix**: Set `ITSAppUsesNonExemptEncryption: false` if not using custom encryption

---

## 📊 Step 9: After Submission

### Review Timeline
- **Typical**: 24-48 hours
- **Can take**: Up to 7 days
- **Expedited**: Available for critical bug fixes (limited)

### Possible Outcomes

1. **Approved** ✅
   - App goes live immediately (or on scheduled date)
   - Available in App Store

2. **Rejected** ❌
   - Apple provides specific reasons
   - Fix issues and resubmit
   - No additional review fee

3. **In Review** 🔄
   - Wait for Apple's decision
   - Can check status in App Store Connect

### Post-Approval

1. **Monitor Reviews**: Respond to user feedback
2. **Analytics**: Set up App Store Connect analytics
3. **Updates**: Plan for future versions
4. **Marketing**: Promote your app launch

---

## 🔄 Step 10: Updates and Maintenance

### Version Updates

1. Update version in `app.json`:
   ```json
   {
     "version": "1.0.1",
     "ios": {
       "buildNumber": "2"
     }
   }
   ```

2. Build new version:
   ```bash
   eas build --platform ios --profile production
   ```

3. Submit update:
   ```bash
   eas submit --platform ios --latest
   ```

### Build Number Rules
- Must increment for each submission
- Can be any number (1, 2, 3... or 1.0.1, 1.0.2...)
- Version string can stay same for bug fixes
- Version string must increment for new features

---

## 💰 Costs Summary

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer Program | $99 | Annual |
| Expo EAS Build | Free (limited) / $29+/mo | Monthly |
| App Store Review | Free | Per submission |
| **Total Minimum** | **$99/year** | - |

**EAS Build Free Tier:**
- 30 builds/month
- Sufficient for most developers

---

## 🛠️ Quick Start Checklist

- [ ] Sign up for Apple Developer Program ($99/year)
- [ ] Create Expo account (free)
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Update `bundleIdentifier` in `app.json`
- [ ] Run `eas build:configure`
- [ ] Create App ID in Apple Developer Portal
- [ ] Create app in App Store Connect
- [ ] Prepare screenshots and app icon
- [ ] Write app description and privacy policy
- [ ] Build: `eas build --platform ios --profile production`
- [ ] Submit: `eas submit --platform ios --latest`
- [ ] Wait for review (24-48 hours typically)

---

## 📚 Additional Resources

- [Expo EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Expo Submission Guide](https://docs.expo.dev/submit/introduction/)

---

## 🆘 Getting Help

- **Expo Forums**: https://forums.expo.dev/
- **Apple Developer Support**: https://developer.apple.com/support/
- **App Store Connect Support**: Available in App Store Connect

Good luck with your App Store submission! 🚀

