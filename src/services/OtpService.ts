
import { generateOTP } from '../utils/helpers';
import { OtpToken } from '../entities/OtpToken';
import { MoreThan, Repository } from 'typeorm';
import { send2FAOtpEmail } from '../templates/TwoFactorAuthEmailTemplate';
import bcrypt from 'bcryptjs';
import { User } from '../entities/User';

export class OtpService {
  private otpRepository: Repository<OtpToken>;
  private userRepository: Repository<User>;

  constructor(
    otpRepository: Repository<OtpToken>,
    userRepository: Repository<User>
  ) {
    this.otpRepository = otpRepository;
    this.userRepository = userRepository;
  }

  async generateAndSendOTP(user: User): Promise<string> {
    // Check if user is locked due to too many OTP attempts
    if (user.otpLockUntil && user.otpLockUntil > new Date()) {
      const lockTimeRemaining = Math.ceil((user.otpLockUntil.getTime() - Date.now()) / 60000);
      throw new Error(`Too many attempts. Try again after ${lockTimeRemaining} minute(s).`);
    }

    // Generate 6-digit OTP
    const otp = generateOTP(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Hash the OTP before storing
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Create and save OTP token
    const otpToken = this.otpRepository.create({
      userId: user.id,
      otp: hashedOtp,
      expiresAt,
      user
    });
    await this.otpRepository.save(otpToken);

    // Send OTP email
    await send2FAOtpEmail(
      user.email,
      user.firstName || user.username,
      otp
    );

    return otp;
  }

  async verifyOTP(userId: number, otp: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) throw new Error('User not found');

    // Check if account is locked due to too many failed OTP attempts
    if (user.otpLockUntil && user.otpLockUntil > new Date()) {
      const lockTimeRemaining = Math.ceil((user.otpLockUntil.getTime() - Date.now()) / 60000);
      throw new Error(`Account temporarily locked due to too many attempts. Try again after ${lockTimeRemaining} minute(s).`);
    }

    // Find the most recent unused OTP token that hasn't expired
    const otpToken = await this.otpRepository.findOne({
      where: {
        userId,
        isUsed: false,
        expiresAt: MoreThan(new Date())
      },
      order: { createdAt: 'DESC' }
    });

    if (!otpToken) {
      await this.handleFailedAttempt(user);
      throw new Error('Invalid or expired OTP');
    }

    // Verify the OTP
    const isValid = await bcrypt.compare(otp, otpToken.otp);
    if (!isValid) {
      await this.handleFailedAttempt(user);
      throw new Error('Invalid OTP');
    }

    // Mark OTP as used
    otpToken.isUsed = true;
    await this.otpRepository.save(otpToken);

    // Reset failed attempts on successful verification
    user.otpAttempts = 0;
    user.otpLockUntil = null;
    await this.userRepository.save(user);

    return true;
  }

  private async handleFailedAttempt(user: User): Promise<void> {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
  
    // Lock account for 30 minutes after 5 failed attempts
    if (user.otpAttempts >= 5) {
      user.otpLockUntil = new Date(Date.now() + 30 * 60 * 1000);
      user.otpAttempts = 0; // Reset counter after locking
    } else {
      user.otpLockUntil = null; 
    }
  
    await this.userRepository.save(user);
  }
}