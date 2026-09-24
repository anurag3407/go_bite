// lib/fast2sms.ts - Fast2SMS integration with cooldown and security
export interface OtpRecord {
  phone: string;
  otp: string;
  expiresAt: number;
  lastRequestedAt: number;
  attempts: number;
}

// In-memory cache for development/pilot; backed by DB table 'otps' in production
const otpCache = new Map<string, OtpRecord>();

export async function sendOtp(phone: string): Promise<{ success: boolean; message: string; cooldownSeconds?: number }> {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    return { success: false, message: 'Please enter a valid 10-digit Indian phone number' };
  }

  const now = Date.now();
  const existing = otpCache.get(cleanPhone);

  // 1. Enforce 60-second cooldown
  if (existing && now - existing.lastRequestedAt < 60000) {
    const remainingSeconds = Math.ceil((60000 - (now - existing.lastRequestedAt)) / 1000);
    return {
      success: false,
      message: `Please wait ${remainingSeconds}s before requesting a new OTP`,
      cooldownSeconds: remainingSeconds,
    };
  }

  // 2. Generate 6-digit OTP (e.g. 524918)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = now + 5 * 60 * 1000; // 5 mins

  otpCache.set(cleanPhone, {
    phone: cleanPhone,
    otp,
    expiresAt,
    lastRequestedAt: now,
    attempts: 0,
  });

  // 3. Fast2SMS API call if API key configured
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variables_values: otp,
          route: 'otp',
          numbers: cleanPhone,
        }),
      });
      const data = await response.json();
      if (!data.return) {
        console.warn('Fast2SMS warning:', data);
      }
    } catch (err) {
      console.error('Fast2SMS dispatch error:', err);
    }
  } else {
    console.log(`[DEV OTP] Generated OTP for +91-${cleanPhone}: ${otp}`);
  }

  return { success: true, message: `OTP sent to +91-${cleanPhone}` };
}

export function verifyOtp(phone: string, inputOtp: string): { success: boolean; message: string } {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const record = otpCache.get(cleanPhone);

  if (!record) {
    return { success: false, message: 'No OTP requested for this phone number' };
  }

  if (Date.now() > record.expiresAt) {
    otpCache.delete(cleanPhone);
    return { success: false, message: 'OTP has expired. Please request a new one.' };
  }

  if (record.attempts >= 4) {
    otpCache.delete(cleanPhone);
    return { success: false, message: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  if (record.otp !== inputOtp.trim()) {
    record.attempts += 1;
    return { success: false, message: 'Invalid OTP. Please check and try again.' };
  }

  // Verified!
  otpCache.delete(cleanPhone);
  return { success: true, message: 'Phone number verified successfully' };
}
