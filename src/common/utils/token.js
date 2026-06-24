// src/common/utils/token.js
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

export const signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

export const signRefreshToken = (payload) =>
  jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });

export const verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);

export const verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

export default {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};