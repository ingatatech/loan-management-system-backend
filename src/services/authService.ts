// @ts-nocheck

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User, UserRole } from "../entities/User";
import { Organization } from "../entities/Organization";
import dbConnection from "../db";
import { Repository } from "typeorm";
import { sendLoginInstructionsEmail } from "../templates/userInstruct";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface UserRegistrationData {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  organizationId?: number;
  phone?: string;
}

export interface PasswordResetData {
  email: string;
  token: string;
  newPassword: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data?: {
    user: Partial<User>;
    token?: string;
    organization?: Partial<Organization>;
  };
  error?: string;
}

class AuthService {
  private userRepository: Repository<User>;
  private organizationRepository: Repository<Organization>;

  constructor() {
    this.userRepository = dbConnection.getRepository(User);
    this.organizationRepository = dbConnection.getRepository(Organization);
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const { username, password } = credentials;

      // Find user with organization relation
      const user = await this.userRepository.findOne({
        where: { username },
        relations: ["organization"],
      });

      if (!user) {
        return {
          success: false,
          message: "Invalid credentials",
        };
      }

      // Check if user account is active
      if (!user.isActive) {
        return {
          success: false,
          message: "Account is deactivated. Please contact administrator.",
        };
      }

      // Check if account is locked
      if (user.isAccountLocked()) {
        return {
          success: false,
          message: "Account is temporarily locked due to multiple failed login attempts.",
        };
      }

      // Validate password
      const isValidPassword = await user.validatePassword(password);
      if (!isValidPassword) {
        await user.incrementFailedLoginAttempts();
        await this.userRepository.save(user);
        
        return {
          success: false,
          message: "Invalid credentials",
        };
      }

      // Check first login
      if (user.isFirstLogin) {
        return {
          success: false,
          message: "First login detected. Please reset your password.",
        };
      }

      // Check if organization is active (for client users)
      if (user.role === UserRole.CLIENT && user.organization && !user.organization.isActive) {
        return {
          success: false,
          message: "Organization account is deactivated.",
        };
      }

      // Reset failed login attempts on successful login
      await user.resetFailedLoginAttempts();
      await this.userRepository.save(user);

      // Generate JWT token
      const token = this.generateToken(user);

      // Exclude sensitive information
      const { hashedPassword, resetPasswordToken, resetPasswordExpires, ...safeUser } = user;

      return {
        success: true,
        message: "Login successful",
        data: {
          user: safeUser,
          token,
          organization: user.organization ? {
            id: user.organization.id,
            name: user.organization.name,
            isActive: user.organization.isActive,
          } : undefined,
        },
      };
    } catch (error: any) {
      console.error("Login error:", error);
      return {
        success: false,
        message: "Login failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async register(userData: UserRegistrationData): Promise<AuthResponse> {
    try {
      const { username, email, password, role, organizationId, phone } = userData;

      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: [{ username }, { email }],
      });

      if (existingUser) {
        return {
          success: false,
          message: existingUser.username === username 
            ? "Username already exists" 
            : "Email already exists",
        };
      }

      // Validate organization if provided
      let organization: Organization | null = null;
      if (organizationId) {
        organization = await this.organizationRepository.findOne({
          where: { id: organizationId },
        });

        if (!organization) {
          return {
            success: false,
            message: "Organization not found",
          };
        }

        if (!organization.isActive) {
          return {
            success: false,
            message: "Organization is not active",
          };
        }
      }

      // Validate system owner role restrictions
      if (role === UserRole.SYSTEM_OWNER) {
        const existingSystemOwner = await this.userRepository.findOne({
          where: { role: UserRole.SYSTEM_OWNER },
        });

        if (existingSystemOwner) {
          return {
            success: false,
            message: "System owner already exists",
          };
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = this.userRepository.create({
        username,
        email,
        hashedPassword,
        role,
        organization,
        organizationId: organization?.id || null,
        phone: phone || null,
        isActive: true,
        isVerified: false,
        isFirstLogin: true,
      });

      await this.userRepository.save(user);
      await sendLoginInstructionsEmail(email, username, password);


      // Exclude sensitive information
      const { hashedPassword: _, resetPasswordToken, resetPasswordExpires, ...safeUser } = user;

      return {
        success: true,
        message: "User registered successfully",
        data: {
          user: safeUser,
          organization: organization ? {
            id: organization.id,
            name: organization.name,
            isActive: organization.isActive,
          } : undefined,
        },
      };
    } catch (error: any) {
      console.error("Registration error:", error);
      return {
        success: false,
        message: "Registration failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async requestPasswordReset(email: string): Promise<AuthResponse> {
    try {
      const user = await this.userRepository.findOne({ where: { email } });

      if (!user) {
        // Return success even if user doesn't exist for security
        return {
          success: true,
          message: "If the email exists, a password reset link will be sent",
        };
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = resetExpires;

      await this.userRepository.save(user);

      // TODO: Send email with reset token
      // await this.sendPasswordResetEmail(user.email, resetToken);

      return {
        success: true,
        message: "Password reset link sent to email",
        data: {
          resetToken: process.env.NODE_ENV === "development" ? resetToken : undefined,
        },
      };
    } catch (error: any) {
      console.error("Password reset request error:", error);
      return {
        success: false,
        message: "Failed to process password reset request",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async resetPassword(resetData: PasswordResetData): Promise<AuthResponse> {
    try {
      const { email, token, newPassword } = resetData;

      const user = await this.userRepository.findOne({
        where: {
          email,
          resetPasswordToken: token,
        },
      });

      if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
        return {
          success: false,
          message: "Invalid or expired reset token",
        };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      user.hashedPassword = hashedPassword;
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      user.isFirstLogin = false;
      user.failedLoginAttempts = 0;
      user.accountLockedUntil = null;

      await this.userRepository.save(user);

      return {
        success: true,
        message: "Password reset successful",
      };
    } catch (error: any) {
      console.error("Password reset error:", error);
      return {
        success: false,
        message: "Password reset failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<AuthResponse> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // Verify current password
      const isValidPassword = await user.validatePassword(currentPassword);
      if (!isValidPassword) {
        return {
          success: false,
          message: "Current password is incorrect",
        };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      user.hashedPassword = hashedPassword;
      user.isFirstLogin = false;

      await this.userRepository.save(user);

      return {
        success: true,
        message: "Password changed successfully",
      };
    } catch (error: any) {
      console.error("Password change error:", error);
      return {
        success: false,
        message: "Password change failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async getUserProfile(userId: number): Promise<AuthResponse> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ["organization"],
      });

      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // Exclude sensitive information
      const { hashedPassword, resetPasswordToken, resetPasswordExpires, ...safeUser } = user;

      return {
        success: true,
        message: "User profile retrieved successfully",
        data: {
          user: safeUser,
          organization: user.organization ? {
            id: user.organization.id,
            name: user.organization.name,
            isActive: user.organization.isActive,
          } : undefined,
        },
      };
    } catch (error: any) {
      console.error("Get user profile error:", error);
      return {
        success: false,
        message: "Failed to retrieve user profile",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async updateUserProfile(userId: number, updateData: Partial<User>): Promise<AuthResponse> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // Only allow certain fields to be updated
      const allowedFields = ["email", "phone"];
      const filteredData: Partial<User> = {};

      for (const field of allowedFields) {
        if (updateData[field as keyof User] !== undefined) {
          (filteredData as any)[field] = updateData[field as keyof User];
        }
      }

      // Check if email is being changed and if it's unique
      if (filteredData.email && filteredData.email !== user.email) {
        const existingUser = await this.userRepository.findOne({
          where: { email: filteredData.email },
        });

        if (existingUser && existingUser.id !== userId) {
          return {
            success: false,
            message: "Email already exists",
          };
        }
      }

      await this.userRepository.update(userId, filteredData);

      // Get updated user
      const updatedUser = await this.userRepository.findOne({
        where: { id: userId },
        relations: ["organization"],
      });

      const { hashedPassword, resetPasswordToken, resetPasswordExpires, ...safeUser } = updatedUser!;

      return {
        success: true,
        message: "User profile updated successfully",
        data: {
          user: safeUser,
        },
      };
    } catch (error: any) {
      console.error("Update user profile error:", error);
      return {
        success: false,
        message: "Failed to update user profile",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  async logout(token: string): Promise<AuthResponse> {
    try {
      // In a production environment, you would add the token to a blacklist
      // For now, we'll just return success
      return {
        success: true,
        message: "Logout successful",
      };
    } catch (error: any) {
      console.error("Logout error:", error);
      return {
        success: false,
        message: "Logout failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }

  private generateToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        role: user.role,
        organizationId: user.organization?.id || null,
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );
  }

  async verifyToken(token: string): Promise<{ valid: boolean; decoded?: any; error?: string }> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      return { valid: true, decoded };
    } catch (error: any) {
      return { 
        valid: false, 
        error: error.name === "TokenExpiredError" ? "Token expired" : "Invalid token" 
      };
    }
  }
}

export default new AuthService();