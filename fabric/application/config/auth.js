"use strict";
const crypto = require('node:crypto');

// Missing configuration grants no API/admin access; ephemeral JWT keys keep health
// and public pages usable. Configure JWT_SECRET for tokens surviving restarts.
const rootSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (Buffer.byteLength(rootSecret) < 32) throw new Error('JWT_SECRET_TOO_SHORT');
function jwtSecret(domain) {
  return crypto.createHmac('sha256', rootSecret).update(`sfc:${domain}`).digest('hex');
}
function credentialsMatch(actual, expected) {
  if (typeof actual !== 'string' || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { jwtSecret, credentialsMatch };
