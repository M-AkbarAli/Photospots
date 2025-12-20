package com.photospots.dto;

public class ApiResponse<T> {
    private boolean success;
    private T data;
    private String error;
    private String message;
    private Integer count;

    public static <T> ApiResponse<T> ok(T data) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.success = true;
        resp.data = data;
        return resp;
    }

    public static <T> ApiResponse<T> ok(T data, int count) {
        ApiResponse<T> resp = ok(data);
        resp.count = count;
        return resp;
    }

    public static <T> ApiResponse<T> error(String error, String message) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.success = false;
        resp.error = error;
        resp.message = message;
        return resp;
    }

    public boolean isSuccess() {
        return success;
    }

    public T getData() {
        return data;
    }

    public String getError() {
        return error;
    }

    public String getMessage() {
        return message;
    }

    public Integer getCount() {
        return count;
    }
}
