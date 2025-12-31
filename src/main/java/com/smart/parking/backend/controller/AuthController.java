package com.smart.parking.backend.controller;

import com.smart.parking.backend.dto.*;
import com.smart.parking.backend.model.User;
import com.smart.parking.backend.service.AuthService;
import com.smart.parking.backend.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = {"http://localhost:3000",
        "https://your-frontend-domain.com",
        "https://smart-parking-w3z.vercel.app"
})
public class AuthController {

    private final AuthService authService;
    private final UserService userService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        log.info("Login attempt for email: {}", request.getEmail());

        try {
            AuthResponse response = authService.login(request);
            log.info("Successful login for email: {}", request.getEmail());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Login failed for email: {}", request.getEmail(), e);
            throw e;
        }
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        log.info("Registration attempt for email: {}", request.getEmail());

        try {
            AuthResponse response = authService.register(request);
            log.info("Successful registration for email: {}", request.getEmail());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Registration failed for email: {}", request.getEmail(), e);
            throw e;
        }
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser(Authentication authentication) {
        // Handle case where authentication is null or invalid
        if (authentication == null || authentication.getName() == null) {
            log.warn("Unauthorized access attempt to /api/auth/me");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            String email = authentication.getName();
            User user = userService.getCurrentUser(email);

            UserProfileResponse response = new UserProfileResponse(
                    user.getId(),
                    user.getEmail(),
                    user.getFullName(),
                    new String[0] // No roles - empty array
            );

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error fetching current user", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }

    @PutMapping("/profile")
    public ResponseEntity<UserProfileResponse> updateProfile(
            @Valid @RequestBody UpdateProfileRequest request,
            Authentication authentication) {

        String email = authentication.getName();
        User updatedUser = userService.updateUserProfile(email, request);

        UserProfileResponse response = new UserProfileResponse(
                updatedUser.getId(),
                updatedUser.getEmail(),
                updatedUser.getFullName(),
                new String[0] // No roles - empty array
        );

        return ResponseEntity.ok(response);
    }
}