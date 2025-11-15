# Seed Script Improvements

## Changes Made ✅

### 1. Fixed Flickr API Sorting
**Problem**: Flickr was returning most recent photos by default
**Solution**: Added `sort=interestingness-desc` to get popular/interesting photos regardless of date

```typescript
url.searchParams.append('sort', 'interestingness-desc'); // Sort by most interesting, NOT recency
url.searchParams.append('content_type', '1'); // Photos only (exclude screenshots/graphics)
url.searchParams.append('per_page', '500'); // Increased from 250 for better data
```

### 2. Expanded Generic Tag Filter
**Problem**: Too many generic tags were getting through (phone, food, construction, etc.)
**Solution**: Massively expanded the generic tags blacklist to ~100+ tags

Categories now filtered:
- Device names (phone, iphone, 17promax, camera brands)
- Generic urban terms (skyscraper, construction, building)
- Transit (ttc, subway, metrolinx)
- Years and dates
- Colors and basic descriptors
- Developer names (tridel, mizrahi)
- Generic street names (bloor, yonge, king)

### 3. Added Tag Quality Filters
**Problem**: Tags like "metrolinx6200bombardierflexityfreedomlrv" and "onebloorwest" were noise
**Solution**: Added multiple quality checks:

```typescript
// Skip tags that are too long (>30 chars) - likely concatenated
if (tag.length > 30) continue;

// Skip tags with 3+ consecutive digits (model numbers, addresses)
if (/\d{3,}/.test(tag)) continue;

// Skip tags with weird casing (multiple capitals = concatenated)
const capitalCount = (tag.match(/[A-Z]/g) || []).length;
if (capitalCount > 2) continue;
```

### 4. Increased Minimum Threshold
**Problem**: 10 photos per tag was too low, allowing noise through
**Solution**: Increased to 15 photos minimum for a tag to be considered a landmark

### 5. Added Photo Counts to Output
Now shows: `agakhanmuseum (114)` instead of just `agakhanmuseum`

## Results Comparison

### BEFORE (Bad Results)
```
phone: 3 hotspots
food: X hotspots
metrolinx6200bombardierflexityfreedomlrv: X hotspots
torontoconstruction: X hotspots
17promax: X hotspots
```

### AFTER (Good Results)
```
agakhanmuseum (114): 5 hotspots
museum (63): 2 hotspots
ontariosciencecentre (17): X hotspots
islamicart (18): 1 hotspot
```

## Remaining Issues to Consider

### 1. Address Tags Still Sneaking Through
- Example: `77wynforddrive` (44 photos)
- **Solution**: Could add regex to filter tags that start with numbers

### 2. Foreign Language Tags
- Example: `été`, `amériquedunord`, `musée`, `artislamique`
- **Note**: These might actually be valid! French-speaking photographers tagging landmarks
- **Decision**: Keep or filter based on your target audience

### 3. Generic Descriptive Tags
- Example: `selfportrait`, `pattern`, `light`, `northamerica`
- These aren't landmarks but made it through due to high photo counts
- **Solution**: Could add these to generic list OR increase minimum threshold

### 4. Concatenated Location Tags
- Example: `ontariosciencecentre` (should be "Ontario Science Centre")
- **Note**: This is actually correct for Flickr - many landmarks are tagged this way
- **Decision**: Could add logic to split camelCase/concatenated words for display

## Recommended Next Steps

### Option A: More Aggressive Filtering
Add more patterns to filter:
- Tags starting with numbers: `/^\d/`
- Single-word generic descriptors to blacklist
- Minimum tag length of 5+ characters

### Option B: Whitelist Approach
Instead of blacklisting generic tags, create a whitelist of:
- Known Toronto landmarks
- Museum names
- Park names
- Historic buildings
This ensures ONLY real landmarks get through

### Option C: Use Multiple Pages
Flickr returns paginated results. Could fetch pages 1-3 to get 1500 photos instead of 500
- More data = better landmark detection
- Might find rarer but interesting spots

### Option D: Combine with Other Data Sources
- Google Places API for landmark verification
- Wikipedia/Wikidata for confirmed landmarks
- Cross-reference Flickr tags with known locations

## Testing Different Locations

Try your script in different areas to validate:
```typescript
// Downtown Toronto (landmarks: CN Tower, ROM, etc.)
lat: 43.6532, lng: -79.3832

// Scarborough (your current test)
lat: 43.7253, lng: -79.3330

// Waterfront
lat: 43.6426, lng: -79.3871

// North York
lat: 43.7615, lng: -79.4111
```

## Configuration Recommendation

Make these parameters configurable at the top of your script:
```typescript
const CONFIG = {
  minPhotosPerLandmark: 15,  // Adjust based on location density
  minPhotosPerHotspot: 3,
  maxTagLength: 30,
  minTagLength: 3,
  radiusKm: 1,
  perPage: 500,
  sortBy: 'interestingness-desc', // or 'relevance'
};
```

This lets you tune the script for different scenarios without editing code.
