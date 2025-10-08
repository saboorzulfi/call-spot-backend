module.exports.maskEmail = (email) => {
    if (!email || !email.includes('@')) return email;
    
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }
    
    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
  }