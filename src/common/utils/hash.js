// src/common/utils/hash.js
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const hashPassword = async (plain) => bcrypt.hash(plain, SALT_ROUNDS);

export const comparePassword = async (plain, hashed) => bcrypt.compare(plain, hashed);

export default { hashPassword, comparePassword };