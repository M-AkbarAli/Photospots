import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { validateRegistration, validateLogin } from '../middlewares/validation';

const router = Router();

// User registration route
router.post('/register', validateRegistration, register);

// User login route
router.post('/login', validateLogin, login);

export default router;