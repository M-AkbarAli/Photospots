import com.fasterxml.jackson.databind.ObjectMapper;
import com.photospots.service.TargetLocation;

public class TestCoords {
    public static void main(String[] args) throws Exception {
        String json = "{\"name\":\"Test\",\"lat\":43.7762,\"lng\":-79.2578,\"radiusKm\":0.5}";
        ObjectMapper mapper = new ObjectMapper();
        TargetLocation loc = mapper.readValue(json, TargetLocation.class);
        System.out.println("Name: " + loc.getName());
        System.out.println("Has coords: " + loc.hasCoordinates());
        System.out.println("Lat: " + loc.getLatitude());
        System.out.println("Lng: " + loc.getLongitude());
    }
}
