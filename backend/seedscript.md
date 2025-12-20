Plan for Flickr-Based Photo Spot Seed Script
Introduction and Goals

The goal is to create a seed script that populates our app with high-quality, relevant photos for photogenic locations (landmarks) near a user. This script will use the Flickr API to find public photos of nearby places and store their data (including exact geo-coordinates). By doing so, the app can quickly present users with a wide range of photos of an area (far more than a generic Google Maps image), and let them navigate to the exact spot where a chosen photo was taken. The key challenge is ensuring the photos are appealing and relevant – if the preloaded images are all low-quality or irrelevant, users won't trust the recommendations. Therefore, the seed script must carefully select images that highlight the location’s appeal, prioritize relevance to the place, and avoid duplicate or junk images.

Key Requirements for the Seed Script

Relevance First, Quality Second: Prioritize photos that clearly show the location or landmark (relevant content), while also seeking good-quality or interesting shots. A fantastic location should not be excluded just because a photo’s camera quality is poor – the place’s intrinsic interest matters most.

Multiple Photos per Location: For each landmark, gather a variety of photos (e.g. 10–50 images) to give users options. This wide range increases the chance the user finds a photo they like. However, we may also designate one “best” photo as a representative thumbnail for the location if needed.

No Duplicates: Ensure the same photo never appears twice under a given location, even if it was found via different search terms or methods. Use the photo’s unique URL or ID to filter out duplicates
stackoverflow.com
.

Public Photos Only: Only include photos that are publicly visible. (For now, we won’t use any private or friends-only images, to avoid permission issues. The Flickr API by default returns public photos for non-authenticated requests
flickr.com
flickr.com
.)

Leverage Community Sources: Optionally incorporate photos from relevant Flickr groups for higher-quality content. For example, the “Toronto” Flickr group contains many great images of Toronto and the GTA. Tapping into group pools could yield more curated or locally popular photos.

Respect API Limits: Keep within Flickr API usage limits to avoid bans or throttling. Flickr allows up to 3600 queries per hour per API key
stackoverflow.com
 (about 1 per second on average). Also, avoid extremely large per_page sizes (above 250) in a single query – large page sizes or pulling thousands of results in one go can lead to API issues or “flagging” on Flickr’s side. (Flickr’s API will only return the first 4,000 results of any search query
flickr.com
, and for geo queries the max per page is 250
flickr.com
.) It’s better to use moderate page sizes (e.g. 100-250) and paginate or refine the query if needed.

With these requirements in mind, we will design the seed script to fetch the most relevant and attractive photos for each target location.

Using the Flickr API to Find Photos

We will use the Flickr REST API (via HTTP requests or a wrapper library) to search for photos that match each location. The primary method is flickr.photos.search, which supports various parameters to filter and sort results
flickr.com
flickr.com
. Below are key aspects of using this API for our purposes:

Search by Text (Keywords): We will search using the place name as the keyword. The text parameter allows free-text search across photo titles, descriptions, and tags
flickr.com
. For example, for “Scarborough Town Centre”, we can query text="Scarborough Town Centre" to find photos tagged or described with that name. This ensures relevance – returned photos likely depict that location. If a place has a well-known abbreviation or nickname (e.g. “STC” for Scarborough Town Centre), we can run additional searches for those keywords as well. Note: If the place name is not very unique (e.g. “Union Station”), we may combine it with a region name or use location filters (below) to avoid irrelevant results from other cities.

Search by Tags: Alternatively or additionally, we can use the tags parameter to require certain tags
flickr.com
. For instance, tags="Scarborough, Town, Centre" with tag_mode=all would require all those words as tags. However, using text is generally more flexible since it covers title/description too. We might use tags if we know a specific tag is consistently used for the location. (E.g., a park might have a specific tag.)

Geographic Filtering: To make sure photos are from the vicinity of the location, we can use Flickr’s geo queries. There are a couple of ways:

By Coordinates (lat/lon): If we have the latitude/longitude of the place (e.g. from Google Maps or a geocoder), we can supply lat={latitude}, lon={longitude} along with a radius (in km or miles) to get photos taken within that radius
flickr.com
. For example, for a small landmark, a radius of 0.2 km might be enough; for a larger area, maybe 1-2 km. We should also set a reasonably high geo accuracy (closer to street-level) if using coordinates. Flickr defines accuracy levels 1 (world) to 16 (street)
flickr.com
 – we can use city-level (~11) or better. Important: When doing a purely radial geo query, Flickr’s default sort is by distance ascending
flickr.com
, which isn’t what we want. We should explicitly set the sort order (see next section). Also, note that Flickr requires some limiting factor for geo queries; since we will have either a text or tag, we satisfy that requirement
flickr.com
 (preventing the API from returning only last 12h of data).

By Place ID or WOE ID: Flickr has its own location identifiers. We could use woe_id (Where-On-Earth ID) or place_id for the city or neighborhood
flickr.com
. For example, Toronto has a WOE ID, and using that would confine the search to Toronto area. However, using woe_id = Toronto and text = "Scarborough Town Centre" might be redundant if the text is specific enough. Still, for ambiguous names, resolving the place to a WOE ID via flickr.places.find could be helpful. This is an optional enhancement – coordinates + radius is usually sufficient for precision.

Sorting – Relevance vs. Interestingness: The Flickr API allows sorting search results by relevance or interestingness, among other options
flickr.com
. Each has benefits:

Relevance: This is the default for text searches and ranks photos by how well they match the query terms (and possibly other factors). Using sort="relevance" ensures we get photos that are very likely about the place in question. However, they might not always be the most beautiful or striking images – a perfectly relevant photo might be a mundane snapshot.

Interestingness: Flickr’s interestingness ranking is an algorithm that surfaces photos that have attracted attention (views, favorites, comments) and are generally of high quality or artistic merit. Using sort="interestingness-desc" will give more visually appealing or popular photos
flickr.com
. The downside is that it might include photos that are artistically nice but less focused on the specific landmark (especially if our query is broad or location not enforced).

Our Strategy: We will use a combination of relevance and interestingness to balance these factors:

First, fetch a set of results sorted by relevance for the location’s name. This ensures we cover the essential shots of the place (even if some are not high-quality).

Then, fetch another set sorted by interestingness (still filtered by the location keyword or area). This will bring in any standout images (beautiful sunsets, creative angles, etc.) from that area, even if they weren’t top of the relevance list.

By merging these two result sets, we get a wide range: we won’t miss the basic relevant photos, and we also include some wow-factor images that make the place look attractive. For example, a query for a park might first get standard photos of its sign or main trail (relevant), and the interestingness-sorted query might add a gorgeous sunrise shot at that park.

Implementation detail: The Flickr API’s sort parameter can be set to "relevance" or "interestingness-desc" (among others like date posted, etc.)
flickr.com
. We will use both in separate API calls. Ensure to include the same search term or geo filter so that the interestingness query still relates to the location (e.g. include the place name in text even when sorting by interestingness, or constrain by lat/lon radius to that place).

Choosing Photo Size and Data (Extras): We need the photos' direct URL, coordinates, and possibly other metadata. We can request extra fields via the extras parameter
flickr.com
. At minimum, we should ask for:

url_l (Large image URL) – a decent resolution photo URL for display. (Large is typically up to ~1024px on longest side. Most photos have this, unless the original is small.)

url_o (Original image URL) – the full resolution, if available. Not all photos allow access to the original, but if they do, this gives the highest quality. We can use it as a fallback if url_l is not provided.

Alternatively, we could request a range: url_z (Medium 640px), url_c (800px), etc., but url_l and url_o should suffice for good quality. The script can choose the best available URL from the returned extras.

geo – to get latitude and longitude of where the photo was taken
flickr.com
. Flickr will include latitude, longitude, and potentially an accuracy level in each photo entry if this is specified. This is crucial for our app to navigate the user to the exact spot.

owner_name – (optional) could be nice to have for credit/attribution if we ever show it.

views – (optional) number of views, which can indicate popularity of the photo. Not strictly needed, but could be used to gauge interest.

tags – (optional) the tags of the photo, could be used to further verify relevance (e.g. ensure the location name is tagged, etc., or to filter out a photo if it has unrelated tags).

By including these extras, each API response will directly give us the image URLs and coordinates, avoiding the need for additional calls (like flickr.photos.getInfo or flickr.photos.geo.getLocation) for each photo.

Using Flickr Groups (Optional Enhancement): Flickr groups often have high-quality thematic photos. For a local-centric app, tapping into a city’s group can provide great results. For example, the Toronto group (“Toronto Pool”) has hundreds of thousands of photos of Toronto
flickr.com
. We can search within such a group by using the group_id parameter in flickr.photos.search
flickr.com
. The plan:

First, find the group ID for relevant groups (e.g., use the Flickr API flickr.groups.search with query “Toronto” to get the nsid of the Toronto group, or find it in group URL). For instance, the Toronto group’s ID might look like something like 12345678@N00 (just as an example format).

Then, for locations in the Toronto area, we can do an additional search query like flickr.photos.search with group_id=<TorontoGroupID> and text="<Place Name>". This will return photos from that group’s pool that match the place name. These are likely taken by enthusiasts and could be high quality. We must still combine with general results, because group-only search might miss some photos (not everyone posts to the group).

Note: Not all cities or areas have a dedicated Flickr group, but many do. We can maintain a mapping of city/region to a group ID (for GTA it could be the Toronto group, maybe others like “Ontario” etc.). If the location falls within those, use the group in search.

Also, group searches may yield fewer results than global search, but often they’re on-topic. We should still check for duplicates (same photo could be both in the group and found via global search).

Using these methods, we will retrieve a robust list of photos for each location: relevant ones, interesting/popular ones, and possibly group-sourced ones – all containing coordinates for navigation.

Removing Duplicates and Filtering Results

To maintain a good user experience, the script needs to filter out any duplicate photos and potentially discard very poor-quality entries:

Duplicate Detection: As we merge results from multiple queries (relevance-sorted, interestingness-sorted, group pool, etc.), some photos might appear in more than one list. For example, a highly interesting photo of Albert Campbell Square might show up in both the relevance search and the interestingness search. We should compare photos by their unique identifiers to avoid storing them twice. Each Flickr photo has a unique id field. We can keep a set of IDs we’ve seen for a location and skip any photo whose ID is already in the set. Alternatively, comparing the image URL (url_l or url_o) is an easy way to catch duplicates – if the URL matches, it’s the same photo
stackoverflow.com
. Using the ID is more robust (since different size URLs still contain the same ID internally). We will implement this check for each location’s photo list.

Why this matters: Flickr’s API can start returning duplicate entries especially when you page deep into results, or if the search criteria overlap. In one experiment, ~420,000 raw results boiled down to only ~9,022 unique images after removing duplicates
stackoverflow.com
. While our scale is smaller, we want to be sure we don’t show the same image repeatedly under different tags or queries.

Quality Filtering: We want to avoid truly bad images (extremely low resolution, blurry, or irrelevant). Since we cannot directly judge image blurriness via the API, we can approximate quality by using metadata:

Resolution check: If the photo’s largest available size (from the URLs we got) is very small (for example, an old camera phone photo might only be 500px across), it may not look good on modern screens. We can filter out photos below a certain resolution threshold. For instance, require at least one dimension > 800 pixels (roughly ~0.6 megapixel). Most recent photos will easily exceed this. This will drop very small or thumbnail images that won’t be appealing.

Views or Interestingness: We have already incorporated interestingness by sorting. Additionally, if a photo has near-zero views or the Flickr interestingness sort put it very low, it might not be engaging. However, we should be careful: a photo of a rarely-photographed spot might have low views simply because few people know about it, yet it could be valuable to include (since it might be the only photo of that cool spot). So we will not strictly remove photos just for low views. Instead, we rely on the mix of interestingness and relevance to naturally bring more popular photos to the top. We might use view count as a tiebreaker if needed (e.g., if we have too many photos, maybe prefer ones with higher views/faves).

Recent vs. Older: It might be worth ensuring some recency (a photo from 15 years ago might be low quality by today’s standards or the place might have changed). We could use min_upload_date or min_taken_date to focus on relatively modern photos
flickr.com
flickr.com
. For instance, we might restrict to photos taken/uploaded in the last 10-15 years, so we don’t get very old scans or low-res images. This is optional, but Flickr allows specifying date ranges if needed.

Safe Content: By default, our searches as an un-authenticated call will only return safe content (non-explicit)
flickr.com
. We should still ensure safe_search=1 just to be explicit about excluding any inappropriate images. We want family-friendly location photos, not something completely off-topic or adult. This is an important filter to maintain trust.

Balancing Variety: We should aim to keep a diverse set of photos for each location: different angles, times of day, etc. The merging of relevance and interestingness should inherently do this. Just make sure not to keep too many near-duplicates (e.g., ten people’s photos of the same iconic view). If our results have many very similar shots, we could optionally limit those. (For example, if 5 photos are almost identical – same skyline shot – perhaps keep the best one or two). However, doing image similarity analysis is beyond the scope here; we will assume the natural variety from Flickr is sufficient, unless we notice obvious redundancy by title/tags (which we likely won't parse deeply).

After these filters, we’ll have a cleaned list of unique, decent-quality photos for the location. If a location is very popular, we might end up with, say, 50+ photos. If it’s less popular, maybe only a dozen – but that’s okay. We prefer quality over quantity.

Handling API Rate Limits and Efficiency

When coding the script, we must ensure it operates within Flickr’s allowed query rate:

We have a hard cap of 3,600 requests per hour
stackoverflow.com
. If our script is seeding many locations, we need to throttle ourselves. For example, if we have to fetch data for 200 places, and for each place we perform 2-3 queries (relevance, interestingness, maybe group), that could be ~600 queries. This is within the hourly limit, but if done too quickly (all at once), we might momentarily exceed the rate (if it averages more than 1 per second).

Implement a short delay between requests (e.g., 0.3 seconds or use a token bucket rate limiter at ~1 req/sec). This will prevent hitting the limit or triggering any abuse detection. It’s better to take a bit longer in the seeding process than to get our API key flagged.

Use efficient queries: We will request ~100 photos per query (via per_page parameter) so that we get plenty of results with each call and avoid excessive paging. per_page=100 is a reasonable balance. (Flickr allows up to 500, but as noted, using the max might not be necessary and could potentially draw attention. Also, for geo queries it effectively maxes at 250
flickr.com
.) If a location needs more than 100 photos, we can fetch page 2, etc., but likely the top 100 sorted results will suffice for our use-case. Keep in mind Flickr will not return more than 4,000 results total for one search
flickr.com
, so if we ever needed to go beyond page ~40 of 100-per-page (which is unlikely for a single place query), we’d have to break it down further (or use date ranges as Flickr suggests).

Monitor for errors: The code should handle any API errors (network issues, rate limit exceeded responses, etc.) gracefully – perhaps by pausing and retrying after a delay if needed.

Step-by-Step Implementation Outline

Below is a step-by-step plan for coding the seed script. This outlines how to fetch and store the data for each location, incorporating the above strategies:

Prepare API Access: Load your Flickr API key (and secret if using a signing method). The script will make REST calls to https://api.flickr.com/services/rest/ with method flickr.photos.search. Decide whether to use a Flickr SDK/wrapper library or direct HTTP calls. (Direct calls are fine since the task is straightforward – just build the URL with parameters or use Python’s requests etc.)

Define Target Locations: Have a list of locations you want to seed. For each location, you should have:

Name of the place (e.g., "Scarborough Town Centre").

(Optionally) its latitude & longitude coordinates, if available.

(Optionally) a city/area name or WOE ID, if needed for disambiguation or group selection.

This list could come from Google Maps API or a predefined list of popular spots. For example, in the GTA: Scarborough Town Centre, Albert Campbell Square, Frank Faubert Wood Lot, CN Tower, High Park, etc.

Loop Over Locations: For each location in the list, do the following:

Construct the primary search query (Relevance): Use flickr.photos.search with parameters:

text = "<Location Name>" (the place name as the keyword)

If you have coordinates: include lat=<latitude>, lon=<longitude>, radius=<some km> to limit by vicinity. Choose radius appropriate for the place size (e.g., 0.5km for a building, 2km for a park). Also set accuracy=11 or accuracy=16 (city or street level accuracy)
flickr.com
 to ensure the geo filter is fairly tight.

sort = "relevance" (to prioritize matching the place)
flickr.com
.

per_page = 100 (number of results to fetch in one go).

page = 1 (start with the first page).

extras = "url_l,url_o,geo,owner_name,views,tags" (as discussed above; include at least URL and geo). Ensure has_geo=1 if we must have geotagged photos (though if we use lat,lon or a place filter, results will inherently have geo).

safe_search = 1 (to exclude unsafe content explicitly)
flickr.com
.

(If not using lat/lon) consider adding a woe_id or bounding box for the broader area to avoid namesakes elsewhere. For example, if the location is in Toronto, maybe use woe_id for Toronto so that “Paris” yields Paris, Ontario vs France confusion – but this is case by case.

Perform the API request and parse the JSON/XML response. Extract the list of photo entries.

Construct the secondary search query (Interestingness): Use flickr.photos.search again with:

Same text (place name) and same geo filters (lat/lon or woe) as above – this ensures we’re looking at roughly the same pool of photos, just sorted differently.

sort = "interestingness-desc"
flickr.com
.

per_page = 100, page = 1.

Same extras and safe_search settings.

Fetch and parse this result. This will give another list of photo entries, biased towards popular/interesting shots of the area.

Optional: If the location is within a known group’s scope (say city = Toronto and we have Toronto group ID):

Construct a third query for the group: e.g., group_id=<TorontoGroupID> plus text = "<Location Name>", and perhaps sort by relevance or interestingness. (If the group is large, relevance within the group might be fine as the group is already likely focused on that city). per_page=50 is probably enough here since it's a narrower pool.

Parse those results. (If a location is not in the Toronto area or no relevant group, skip this step.)

Merge Results: Combine the photo entries from all queries into one list. Now perform duplicate filtering:

Initialize an empty set (or dict) to track seen photo IDs.

Iterate through the combined list of photos. For each photo:

Check its id (or the url_l/url_o). If the ID is already in the set, skip this photo (it’s a duplicate found via another query).

Otherwise, add the ID to the set and keep the photo in the filtered list.

The result is a de-duplicated list of photo data for the location.

Filter for Quality: Now go through the filtered list and remove or flag any that don’t meet our quality criteria:

If the photo’s available URL suggests very low resolution (for instance, if url_l is missing and only a small size is available, or if the width/height in o_dims if provided are below, say, 800px), consider dropping it. Most modern photos will have a url_l. We can check for presence of url_l or the dimensions if provided. If only a tiny thumbnail is returned, skip that photo.

Ensure the photo is geotagged: if for some reason latitude/longitude are missing (maybe an edge case if has_geo wasn’t enforced), and we require geo, we might drop it. But since we likely set has_geo=1 or used geo search, every photo should have coordinates.

We might also ensure variety by not taking too many photos that have identical titles or taken by the same photographer at the same spot, but this is minor. If the data includes tags, we could verify the place name is in the tags or title – but since we searched by text, relevance results already ensure that. So this step can be light.

After this filtering, we should have a list of the best candidate photos for the location.

Select Top Photo(s) if needed: If we want to highlight one best photo for quick display (like a cover image for the location), we can pick one from the list:

Perhaps the first photo from the relevance-sorted results or the highest-viewed from the interestingness set could serve as the cover. Another approach: pick the photo with the highest views or a median of high interestingness that also clearly shows the landmark. Since this is somewhat subjective, we could simply choose the first photo from the relevance query as the representative (because it directly matches the search best), or manually inspect a few. For now, let's say the first relevance result (after filtering) is the default representative image.

This “best photo” can be stored separately or flagged in the data. But do not discard the others – the whole point is the user can scroll through many.

Store the results: Save the cleaned photo list to our database or output structure:

We should store for each photo: at least the photo_id, title (maybe), latitude, longitude, and the chosen image URL (preferably url_l or url_o). We might store multiple URLs (for different sizes) if we plan to show thumbnails vs full screen, but not strictly necessary if we can dynamically resize.

Also store owner_name if we plan to attribute, and perhaps a link to the photo page (which can be constructed as https://flickr.com/photo.gne?id=<photo_id> or using owner and ID).

Store a reference to which location this photo belongs to (e.g., the location name or an ID for the landmark in our system).

If using a JSON file, for example, the structure could be:

{
  "Scarborough Town Centre": {
    "representative_photo": { ...photo data... },
    "photos": [ ... list of photo data objects ... ]
  },
  "Albert Campbell Square": { ... },
  ...
}


If using a database, create tables accordingly (e.g., Locations table and Photos table with foreign key).

Make sure to commit/write after each location or batch of locations.

Respect Rate Limits: Between each API call (each flickr.photos.search), insert a small delay (e.g., time.sleep(0.5) seconds). This ensures we do not hit more than ~2 calls per second. This is well under the 3600/hour limit
stackoverflow.com
 and provides a cushion for network latency. If the list of locations is very long, consider implementing a counter to not exceed, say, 3000 calls in an hour (the script could track how many calls made and sleep longer if approaching the limit).

Log Progress and Errors: As the script runs, log which location is being processed and how many photos were found/kept. If the Flickr API responds with an error for a query (e.g., rate limit exceeded or other issue), catch that and handle it:

If rate limit, pause and retry after a wait.

If network error, retry a couple times or skip with a warning.

If a location yields 0 photos (which can happen if the place is very unknown or our query is too strict), log that as well. We might then try a fallback (e.g., relax the search terms or increase radius, or mark the location as needing manual image).

After Loop – Completion: Once all locations are processed, ensure all data is saved. The result is a seeded dataset of locations each with a collection of curated Flickr photos and exact coordinates.

Testing the Output: It’s important to test that for a given location, the photos indeed look good:

Randomly pick a couple of locations and visually inspect the top few image URLs that we saved. Do they show the landmark nicely? Are there any obvious bad picks (like an unrelated image or a very dark/blurry shot)? If so, we may need to adjust the search terms or filtering. For example, if we got irrelevant images, perhaps the place name is too generic – we might then include the city name in the text search (e.g., search "Albert Campbell Square Scarborough" instead of just "Albert Campbell Square"). If we got many low-quality images, we might tighten the date or resolution filter.

Also verify the coordinates correspond to the location. We can cross-check one photo’s lat/lon by plugging into Google Maps to see if it’s indeed at the landmark. Flickr coordinates are provided by users and usually accurate for well-tagged photos, but there can be occasional errors. Our app’s selling point is leading users to the exact spot, so we want to be sure those coordinates make sense. If a particular photo’s geo seems off (e.g., miles away), we might exclude that photo as a bad data point.

Iterate if Necessary: Based on testing, refine the process. This might involve:

Adding specific search term variations for certain locations (e.g., some places might be better searched by a common nickname).

Adjusting the number of photos to fetch. If we see that the first 50 are great and later ones are repetitive, we might not need 100 per query. Or if a location had more to offer, we could get page 2 of interestingness, etc.

Including group search for more places or not, depending on results quality.

By following these steps, the seed script will populate the app’s database with a rich set of photos for each nearby landmark. When a user opens the app near Scarborough Town Centre (to use our example), the app can show Scarborough Town Centre, Albert Campbell Square, Frank Faubert Wood Lot, etc., each with an attractive cover image. Upon selecting one, the user will see a gallery of photos of that place – drawn from Flickr but pre-fetched by our script – and can then pick one they like. The app will then guide them to the exact coordinates of that photo, enabling them to capture a similar shot for their own social media post. This provides a much more engaging and targeted experience than simply browsing random Google Maps images, fulfilling our goal of being a better “photo spot finder” solution.

Conclusion

In summary, the seed script uses the Flickr API to gather relevant and high-quality images for each point of interest, while carefully removing duplicates and filtering out poor content. We prioritized relevance (so each photo truly represents the location) and then boosted quality by incorporating Flickr’s interestingness and group pools. By respecting API limits and using efficient queries, the script will run safely and populate our app’s database with the necessary data. The end result will be an app experience where users can discover great photo spots near them, view a variety of example photos for inspiration, and get directions to stand exactly where those photos were taken. This level of detail and curation will set our app apart from generic map image searches and should greatly enhance user satisfaction.