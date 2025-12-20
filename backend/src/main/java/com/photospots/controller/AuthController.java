package com.photospots.controller;

import com.photospots.dto.ApiResponse;
import com.photospots.dto.UserDto;
import com.photospots.security.JwtTokenProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/auth")
public class AuthController {

    private final JwtTokenProvider jwtTokenProvider;

    public AuthController(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @GetMapping("/me")
    public ResponseEntity<?> me() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) {
            return ResponseEntity.status(401).body(ApiResponse.error("Unauthorized", "No authentication token"));
        }
        String userId = (String) auth.getPrincipal();
        String email = null;
        if (auth.getDetails() instanceof java.util.Map<?, ?> details) {
            Object e = details.get("email");
            if (e instanceof String s) {
                email = s;
            }
        }
        UserDto user = new UserDto(userId, email);
        return ResponseEntity.ok(ApiResponse.ok(user));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout() {
        // Stateless JWT logout - client removes token
        return ResponseEntity.ok().body(ApiResponse.ok(null));
    }
}
