package com.curbside.parking.backend.repository;

import com.curbside.parking.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    // Custom method to find a user by email
    Optional<User> findByEmail(String email);

}
