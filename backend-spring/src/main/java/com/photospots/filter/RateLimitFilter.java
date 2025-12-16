package com.photospots.filter;

import com.photospots.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static class Counter {
        long windowStartMs;
        int count;
    }

    private final Map<String, Counter> buckets = new ConcurrentHashMap<>();
    private final long windowMs;
    private final int maxRequests;

    public RateLimitFilter(AppProperties appProperties) {
        this.windowMs = appProperties.getRateLimit().getWindowMs();
        this.maxRequests = appProperties.getRateLimit().getMaxRequests();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {

        String ip = request.getRemoteAddr();
        long now = Instant.now().toEpochMilli();

        Counter c = buckets.compute(ip, (k, existing) -> {
            if (existing == null) {
                Counter created = new Counter();
                created.windowStartMs = now;
                created.count = 1;
                return created;
            }
            long elapsed = now - existing.windowStartMs;
            if (elapsed > windowMs) {
                existing.windowStartMs = now;
                existing.count = 1;
                return existing;
            }
            existing.count += 1;
            return existing;
        });

        if (c.count > maxRequests) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Too many requests\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }
}
