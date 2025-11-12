const crypto = require('crypto');

// Use environment variable for encryption key or default
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

// Ensure encryption key is 32 bytes (256 bits) for AES-256
function getKey() {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  // Hash the key to ensure it's exactly 32 bytes
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Encrypt text using AES-256-CBC
 */
function encrypt(text) {
  if (!text) return text;
  
  try {
    const key = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt text using AES-256-CBC
 * Handles both encrypted format (iv:encrypted) and plain text (for backward compatibility)
 */
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  try {
    // Check if the text contains ':' separator (encrypted format)
    if (encryptedText.includes(':')) {
      const textParts = encryptedText.split(':');
      const ivHex = textParts.shift();
      const encryptedData = textParts.join(':');
      
      // Validate IV format (should be 32 hex chars = 16 bytes)
      if (!ivHex || ivHex.length !== 32) {
        console.warn(`⚠️  Invalid IV format (length: ${ivHex?.length || 0}, expected: 32) - treating as plain text`);
        return encryptedText; // Return as-is, might be plain text with ':' in it
      }
      
      // Validate encrypted data format (should be multiple of 32 hex chars = 16 bytes blocks)
      // Minimum encrypted data should be at least 32 hex characters (16 bytes)
      if (!encryptedData || encryptedData.length < 32 || encryptedData.length % 32 !== 0) {
        console.warn(`⚠️  Invalid encrypted data format (length: ${encryptedData?.length || 0}) - data may be corrupted or plain text`);
        console.warn(`⚠️  Encrypted data preview: ${encryptedData?.substring(0, 50)}`);
        // If it looks like it might be a token, return as-is
        if (/^[A-Za-z0-9_.-]+$/.test(encryptedData)) {
          console.warn(`⚠️  Data appears to be plain text token - returning as-is`);
          return encryptedData;
        }
        // If the full text looks like a token, return it
        if (/^[A-Za-z0-9_.:-]+$/.test(encryptedText)) {
          console.warn(`⚠️  Full text appears to be plain text - returning as-is`);
          return encryptedText;
        }
        throw new Error(`Invalid encrypted data format: expected multiple of 32 hex chars, got ${encryptedData?.length || 0}`);
      }
      
      const key = getKey();
      const iv = Buffer.from(ivHex, 'hex');
      
      // Validate IV buffer length
      if (iv.length !== 16) {
        throw new Error('Invalid IV length');
      }
      
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else {
      // If no ':' separator, assume it's plain text (backward compatibility)
      // This handles cases where tokens were stored unencrypted
      console.warn('⚠️  Decrypting data without encryption format - assuming plain text');
      return encryptedText;
    }
  } catch (error) {
    // If decryption fails, check if it might be plain text
    if (error.code === 'ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH' || 
        error.code === 'ERR_OSSL_BAD_DECRYPT' ||
        error.message.includes('wrong final block length') ||
        error.message.includes('Invalid IV') ||
        error.message.includes('bad decrypt')) {
      console.warn('⚠️  Decryption failed - data may be stored as plain text or corrupted');
      console.warn(`⚠️  Error: ${error.message}`);
      console.warn(`⚠️  Encrypted text preview: ${encryptedText?.substring(0, 100)}`);
      
      // Try to detect if it's actually a plain text token
      // Tokens are usually alphanumeric with some special chars
      const cleanText = encryptedText.replace(/:/g, ''); // Remove colons for testing
      if (/^[A-Za-z0-9_.-]+$/.test(cleanText) && cleanText.length > 10) {
        console.warn('⚠️  Data appears to be a plain text token - returning as-is');
        // If it had a colon, it might be the part after the colon that's the actual token
        if (encryptedText.includes(':')) {
          const parts = encryptedText.split(':');
          // Return the part that looks most like a token
          for (const part of parts) {
            if (/^[A-Za-z0-9_.-]+$/.test(part) && part.length > 10) {
              return part;
            }
          }
        }
        return encryptedText;
      }
      
      // If it's a short string that looks like a token, return it
      if (encryptedText.length < 200 && /^[A-Za-z0-9_.:-]+$/.test(encryptedText)) {
        console.warn('⚠️  Short string appears to be plain text token - returning as-is');
        return encryptedText;
      }
    }
    console.error('Decryption error:', error);
    console.error('Encrypted text length:', encryptedText?.length);
    console.error('Encrypted text preview:', encryptedText?.substring(0, 100));
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

module.exports = {
  encrypt,
  decrypt
};
