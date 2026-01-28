#!/usr/bin/env node

/**
 * Generate a secure random password for AUTH_PASSWORD
 * Usage: node generate-password.js [length]
 */

import crypto from 'crypto';

const length = parseInt(process.argv[2]) || 24;

// Generate cryptographically secure random password
const password = crypto.randomBytes(length)
  .toString('base64')
  .slice(0, length)
  .replace(/[+/=]/g, (c) => {
    // Replace URL-unsafe characters
    if (c === '+') return '-';
    if (c === '/') return '_';
    return '';
  });

console.log('');
console.log('🔐 Generated secure password:');
console.log('');
console.log(`  ${password}`);
console.log('');
console.log('Add this to your backend/.env file:');
console.log('');
console.log(`  AUTH_PASSWORD=${password}`);
console.log('');
console.log('⚠️  Keep this password secure and don\'t commit it to git!');
console.log('');
