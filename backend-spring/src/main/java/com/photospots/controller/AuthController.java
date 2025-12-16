package com.photospots.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/auth")
public class AuthController {

    @GetMapping("/me")
    public ResponseEntity<?> me() {
        // TODO: return authenticated user info from JWT claims
        return ResponseEntity.status(501).body("Not implemented");
    }

    @GetMapping("/logout")
    public ResponseEntity<?> logout() {
        // TODO: implement stateless logout (token revocation) or rely on client discard
        return ResponseEntity.ok().build();
    }
}
