package com.curbside.parking.backend.impl;

import com.curbside.parking.backend.model.User;
import com.curbside.parking.backend.repository.UserRepository;
import com.curbside.parking.backend.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Autowired
    public UserServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public User registerUser(User user) {
        try {
            String hashedPassword = passwordEncoder.encode(user.getPassword());
            user.setPassword(hashedPassword);
            return userRepository.save(user);
        } catch (Exception e) {
            System.err.println("❌ Error during registration: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }

        @Override
        public List<User> getAllUsers() {
            return userRepository.findAll();
        }

        @Override
        public User getUserById(Long id) {
            Optional<User> user = userRepository.findById(id);
            return user.orElse(null);
        }

    }
}
