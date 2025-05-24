package com.curbside.parking.backend.service;

import lombok.RequiredArgsConstructor;
import com.curbside.parking.backend.dto.AuthResponse;
import com.curbside.parking.backend.dto.LoginRequest;
import com.curbside.parking.backend.dto.RegisterRequest;
import com.curbside.parking.backend.exception.BadRequestException;
import com.curbside.parking.backend.model.User;
import com.curbside.parking.backend.repository.UserRepository;
import com.curbside.parking.backend.security.JwtUtil;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtUtil jwtUtil;

    public AuthResponse register(RegisterRequest request) {
        // Check if email already exists
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new BadRequestException("Email is already taken");
        }

        // Create new user
        User user = new User();
        user.setFullName(request.getFullName());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));

        // Set default role
        Set<String> roles = new HashSet<>();
        roles.add("USER");
        user.setRoles(roles);

        userRepository.save(user);

        // Generate JWT token
        String token = jwtUtil.generateToken(user);
        String[] rolesArray = user.getRoles().toArray(new String[0]);
        return new AuthResponse(token, user.getEmail(), user.getFullName(), rolesArray);
    }

    public AuthResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);

        User user = (User) authentication.getPrincipal();
        String token = jwtUtil.generateToken(user);
        String[] rolesArray = user.getRoles().toArray(new String[0]);
        return new AuthResponse(token, user.getEmail(), user.getFullName(), rolesArray);
    }
}