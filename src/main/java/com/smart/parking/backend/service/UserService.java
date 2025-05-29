package com.smart.parking.backend.service;

import com.smart.parking.backend.dto.UpdateProfileRequest;
import com.smart.parking.backend.model.User;

public interface UserService {
    User getCurrentUser(String email);
    User updateUserProfile(String email, UpdateProfileRequest request);
}