import { config } from './index.js';

export const whatsappConfig = config.whatsapp;

export const graphUrl = (path) =>
  `https://graph.facebook.com/${config.whatsapp.apiVersion}/${path}`;

export default whatsappConfig;
