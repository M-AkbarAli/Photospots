package com.photospots.security;

import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Override
    protected void doFilterInternal(jakarta.servlet.http.HttpServletRequest request, 
                                   jakarta.servlet.http.HttpServletResponse response, 
                                   jakarta.servlet.FilterChain filterChain)
            throws jakarta.servlet.ServletException, IOException {
        
        String authHeader = request.getHeader("Authorization");
        
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                if (jwtTokenProvider.isValid(token)) {
                    String subject = jwtTokenProvider.extractSubject(token);
                    String email = jwtTokenProvider.extractEmail(token);
                    Map<String, Object> details = new HashMap<>();
                    details.put("email", email);
                    UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        subject, null, Collections.emptyList()
                    );
                    auth.setDetails(details);
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (Exception ignored) {
                // Invalid token - continue as unauthenticated
            }
        }
        
        filterChain.doFilter(request, response);
    }
}
