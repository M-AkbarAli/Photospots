// src/types/user.ts

export interface User {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserProfile {
    userId: string;
    bio?: string;
    profilePictureUrl?: string;
    websiteUrl?: string;
    socialLinks?: {
        [key: string]: string; // e.g., { twitter: "https://twitter.com/user" }
    };
}