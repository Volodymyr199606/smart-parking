package com.curbside.parking.backend.exception;

import org.springframework.http.HttpStatus;

public class ResourceNotFoundException extends ApiException {
    public ResourceNotFoundException(String resource, String field, Object value) {
        super(HttpStatus.NOT_FOUND, String.format("%s not found with %s: '%s'", resource, field, value));
    }
}