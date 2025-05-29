package com.curbside.parking.backend.service;

import com.curbside.parking.backend.dto.UpdateProfileRequest;
import com.curbside.parking.backend.model.User;

public interface UserService {
    User getCurrentUser(String email);
    User updateUserProfile(String email, UpdateProfileRequest request);
}