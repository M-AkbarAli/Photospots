package com.photospots.dto;

public class UserDto {
    private String id;
    private String email;

    public UserDto(String id, String email) {
        this.id = id;
        this.email = email;
    }

    public String getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }
}
