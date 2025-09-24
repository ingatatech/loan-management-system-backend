// @ts-nocheck

import { generateOTP, sendEmail } from '../utils/helpers';
import { OtpToken } from '../entities/OtpToken';
import { MoreThan, Repository } from 'typeorm';
import {TwoFactorAuthHtml} from '../templates/TwoFactorAuthHtml'
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
    if (user.otpLockUntil && user.otpLockUntil > new Date()) {
      throw new Error(`Too many attempts. Try again after ${user.otpLockUntil}`);
    }

    const otp = generateOTP(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

    const otpToken = this.otpRepository.create({
      userId: user.id,
      otp: await bcrypt.hash(otp, 10),
      expiresAt,
      user
    });
    await this.otpRepository.save(otpToken);

    await sendEmail({
      to: user.email,
      subject: 'Your Two-Factor Authentication Code',
      html: TwoFactorAuthHtml(user.firstName, otp),
      text: ''
    });

    return otp;
  }

  async verifyOTP(userId: number, otp: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) throw new Error('User not found');

    if (user.otpLockUntil && user.otpLockUntil > new Date()) {
      throw new Error('Account temporarily locked due to too many attempts');
    }

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

    const isValid = await bcrypt.compare(otp, otpToken.otp);
    if (!isValid) {
      await this.handleFailedAttempt(user);
      throw new Error('Invalid OTP');
    }

    otpToken.isUsed = true;
    await this.otpRepository.save(otpToken);

    user.otpAttempts = 0;
    user.otpLockUntil = null;
    await this.userRepository.save(user);

    return true;
  }

  private async handleFailedAttempt(user: User): Promise<void> {
    user.otpAttempts += 1;
  
    if (user.otpAttempts >= 5) {
      user.otpLockUntil = new Date(Date.now() + 30 * 60 * 1000);
      user.otpAttempts = 0;
    } else {
      user.otpLockUntil = null; 
    }
  
    await this.userRepository.save(user);
  }
  
}