import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { User } from '../../types/user';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Register a new user
export const register = async (req: Request, res: Response) => {
    const { email, password, username } = req.body;

    // Check if user already exists
    const { data: existingUser, error: existingUserError } = await supabase
        .from<User>('users')
        .select('*')
        .eq('email', email)
        .single();

    if (existingUserError && existingUserError.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Database error' });
    }

    if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const { data: newUser, error: createUserError } = await supabase
        .from<User>('users')
        .insert([{ email, password: hashedPassword, username }]);

    if (createUserError) {
        return res.status(500).json({ error: 'Error creating user' });
    }

    return res.status(201).json({ user: newUser });
};

// Login user
export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Find user by email
    const { data: user, error: userError } = await supabase
        .from<User>('users')
        .select('*')
        .eq('email', email)
        .single();

    if (userError) {
        return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });

    return res.status(200).json({ token });
};

// Middleware to authenticate user
export const authenticate = (req: Request, res: Response, next: Function) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
        if (err) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.userId = decoded.id;
        next();
    });
};