package com.curbside.parking.backend.service;

import com.curbside.parking.backend.dto.UpdateProfileRequest;
import com.curbside.parking.backend.exception.BadRequestException;
import com.curbside.parking.backend.model.User;
import com.curbside.parking.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;

    @Override
    public User getCurrentUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new BadRequestException("User not found"));
    }

    @Override
    @Transactional
    public User updateUserProfile(String email, UpdateProfileRequest request) {
        User user = getCurrentUser(email);
        user.setFullName(request.getFullName());
        return userRepository.save(user);
    }
}