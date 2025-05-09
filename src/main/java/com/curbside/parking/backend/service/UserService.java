package com.curbside.parking.backend.service;


import com.curbside.parking.backend.model.User;

import java.util.List;

public interface UserService {

    User registerUser(User user);

    List<User> getAllUsers();

    User getUserById(Long id);

    User login(String email, String rawPassword);

}
