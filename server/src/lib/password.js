// Password hashing helpers (bcryptjs — pure JS, no native build step, works
// cleanly on Windows/Mac/Linux).
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
