import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import authService from "../services/authService";
import { User } from "../entities/User";
import dbConnection from "../db";
import { OtpToken } from "../entities/OtpToken";
import { OtpService } from "../services/OtpService";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { UploadToCloud } from "../helpers/cloud";
import SecurityService from "../services/securityService";
import { AuditAction, AuditResource, AuditStatus } from "../entities/AuditLog";

const excludePassword = (user: User) => {
  const { hashedPassword, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
}

class AuthController {
  static login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const userRepository = dbConnection.getRepository(User);
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
        return;
      }

      const user = await userRepository.findOne({
        where: { email },
        relations: ["organization"],
        select: {
          id: true,
          username: true,
          email: true,
          hashedPassword: true,
          role: true,
          phone: true,
          isActive: true,
          isVerified: true,
          isFirstLogin: true,
          failedLoginAttempts: true,
          accountLockedUntil: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          firstName: true,
          lastName: true,
          organizationId: true,
          is2FAEnabled: true,
          otpAttempts: true,
        },
      });

      if (!user) {
        // Audit: login attempt for unknown email
        SecurityService.createAuditLog({
          action: AuditAction.LOGIN_FAILED,
          resource: AuditResource.USER,
          status: AuditStatus.FAILURE,
          description: `Login failed — no account found for email: ${email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: { email, reason: "user_not_found" },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
        return;
      }

      if (!user.isActive) {
        // Audit: inactive account login attempt
        SecurityService.createAuditLog({
          action: AuditAction.LOGIN_FAILED,
          resource: AuditResource.USER,
          resourceId: String(user.id),
          userId: user.id,
          organizationId: user.organizationId ?? undefined,
          status: AuditStatus.BLOCKED,
          description: `Login blocked — account inactive for user: ${email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: { email, reason: "account_inactive" },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(403).json({
          success: false,
          message:
            "Your account is inactive. Please request permission from the System Leader to activate your account.",
        });
        return;
      }

      if (!user.hashedPassword) {
        res.status(500).json({
          success: false,
          message: "Account configuration error. Please contact support.",
        });
        return;
      }

      const passwordStr = String(password);
      const hashedPasswordStr = String(user.hashedPassword);

      let isValidPassword: boolean;
      try {
        isValidPassword = await bcrypt.compare(passwordStr, hashedPasswordStr);
      } catch (bcryptError: any) {
        res.status(500).json({
          success: false,
          message: "Password verification error. Please contact support.",
          error:
            process.env.NODE_ENV === "development"
              ? bcryptError.message
              : undefined,
        });
        return;
      }

      if (!isValidPassword) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        const willLock = user.failedLoginAttempts >= 5;
        if (willLock) {
          user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        }
        await userRepository.save(user);

        // Audit: wrong password
        SecurityService.createAuditLog({
          action: AuditAction.LOGIN_FAILED,
          resource: AuditResource.USER,
          resourceId: String(user.id),
          userId: user.id,
          organizationId: user.organizationId ?? undefined,
          status: AuditStatus.FAILURE,
          description: `Login failed — invalid password for user: ${email}${willLock ? " (account now locked)" : ""}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: {
            email,
            reason: "invalid_password",
            failedAttempts: user.failedLoginAttempts,
            accountLocked: willLock,
          },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
        return;
      }

      if (user.failedLoginAttempts > 0) {
        user.failedLoginAttempts = 0;
        user.accountLockedUntil = null;
        user.lastLoginAt = new Date();
        await userRepository.save(user);
      }

      if (user.isFirstLogin) {
        // Audit: first login — password reset required
        SecurityService.createAuditLog({
          action: AuditAction.LOGIN_FAILED,
          resource: AuditResource.USER,
          resourceId: String(user.id),
          userId: user.id,
          organizationId: user.organizationId ?? undefined,
          status: AuditStatus.PENDING,
          description: `Login blocked — first login password reset required for user: ${email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: { email, reason: "first_login_password_reset_required" },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(403).json({
          success: false,
          message: "First login detected. Please reset your password.",
          requiresPasswordReset: true,
          email: user.email,
        });
        return;
      }

      if (!user.organization?.isActive) {
        // Audit: organization deactivated
        SecurityService.createAuditLog({
          action: AuditAction.LOGIN_FAILED,
          resource: AuditResource.USER,
          resourceId: String(user.id),
          userId: user.id,
          organizationId: user.organizationId ?? undefined,
          status: AuditStatus.BLOCKED,
          description: `Login blocked — organization deactivated for user: ${email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: {
            email,
            reason: "organization_inactive",
            organizationId: user.organizationId,
          },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(403).json({
          success: false,
          message:
            "You cannot log in because your organization's account is deactivated. Please request your account manager to know the actual problem.",
        });
        return;
      }

      // 2FA Check — Send OTP if enabled
      if (user.is2FAEnabled) {
        const otpService = new OtpService(
          dbConnection.getRepository(OtpToken),
          userRepository
        );

        try {
          await otpService.generateAndSendOTP(user);

          // Audit: 2FA OTP sent — login pending OTP verification
          SecurityService.createAuditLog({
            action: AuditAction.MFA_VERIFIED,
            resource: AuditResource.USER,
            resourceId: String(user.id),
            userId: user.id,
            organizationId: user.organizationId ?? undefined,
            status: AuditStatus.PENDING,
            description: `2FA OTP sent to email — login pending verification for user: ${email}`,
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
            metadata: { email, reason: "2fa_otp_sent" },
          }).catch((err) => console.error("Audit log error:", err));

          res.status(200).json({
            success: true,
            message: "OTP sent to your email. Please verify to complete login.",
            requiresOTP: true,
            email: user.email,
          });
          return;
        } catch (error: any) {
          res.status(429).json({
            success: false,
            message: error.message || "Failed to send OTP. Please try again.",
          });
          return;
        }
      }

      // If 2FA is not enabled, proceed with normal login
      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role,
          organizationId: user.organization.id,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "2400h" }
      );

      // Audit: successful login
      SecurityService.createAuditLog({
        action: AuditAction.LOGIN_SUCCESS,
        resource: AuditResource.USER,
        resourceId: String(user.id),
        userId: user.id,
        organizationId: user.organization.id,
        status: AuditStatus.SUCCESS,
        description: `User logged in successfully: ${email}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata: {
          email,
          role: user.role,
          organizationId: user.organization.id,
        },
      }).catch((err) => console.error("Audit log error:", err));

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user: excludePassword(user),
          organization: {
            id: user.organization.id,
            name: user.organization.name,
            isActive: user.organization.isActive,
          },
        },
        token,
      });
    } catch (error) {
      next(error);
    }
  };

  // New verifyOTP method for 2FA login
  static verifyOTPFor2FA = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { email, otp } = req.body;

      await body("email").isEmail().withMessage("Invalid email").run(req);
      await body("otp")
        .isLength({ min: 6, max: 6 })
        .isNumeric()
        .withMessage("OTP must be a 6-digit number")
        .run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const userRepository = dbConnection.getRepository(User);
      const user = await userRepository.findOne({
        where: { email },
        relations: ["organization"],
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "Invalid email or OTP",
        });
        return;
      }

      const otpService = new OtpService(
        dbConnection.getRepository(OtpToken),
        userRepository
      );

      try {
        await otpService.verifyOTP(user.id, otp);

        // Generate JWT token after successful OTP verification
        const token = jwt.sign(
          {
            userId: user.id,
            role: user.role,
            organizationId: user.organization?.id || null,
          },
          process.env.JWT_SECRET!,
          { expiresIn: "2400h" }
        );

        // Audit: 2FA login completed successfully
        SecurityService.createAuditLog({
          action: AuditAction.LOGIN_SUCCESS,
          resource: AuditResource.USER,
          resourceId: String(user.id),
          userId: user.id,
          organizationId: user.organization?.id ?? undefined,
          status: AuditStatus.SUCCESS,
          description: `User completed 2FA login successfully: ${email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: {
            email,
            role: user.role,
            organizationId: user.organization?.id,
            loginMethod: "2fa_otp",
          },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(200).json({
          success: true,
          message: "OTP verified successfully. Login complete.",
          data: {
            user: excludePassword(user),
            organization: user.organization
              ? {
                  id: user.organization.id,
                  name: user.organization.name,
                  isActive: user.organization.isActive,
                }
              : undefined,
          },
          token,
        });
      } catch (error: any) {
        // Audit: 2FA OTP verification failed
        SecurityService.createAuditLog({
          action: AuditAction.LOGIN_FAILED,
          resource: AuditResource.USER,
          resourceId: String(user.id),
          userId: user.id,
          organizationId: user.organizationId ?? undefined,
          status: AuditStatus.FAILURE,
          description: `2FA OTP verification failed for user: ${email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: { email, reason: "2fa_otp_invalid", error: error.message },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    } catch (error) {
      next(error);
    }
  };

  static async requestPasswordReset(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const { email } = req.body;

    await body("email").isEmail().withMessage("Invalid email").run(req);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const userRepository = dbConnection.getRepository(User);
    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      res.status(200).json({
        success: true,
        message: "If the email exists, an OTP will be sent",
      });
      return;
    }

    const otpService = new OtpService(
      dbConnection.getRepository(OtpToken),
      userRepository
    );

    try {
      await otpService.generateAndSendOTP(user);

      // Audit: password reset requested
      SecurityService.createAuditLog({
        action: AuditAction.PASSWORD_RESET_REQUEST,
        resource: AuditResource.USER,
        resourceId: String(user.id),
        userId: user.id,
        organizationId: user.organizationId ?? undefined,
        status: AuditStatus.SUCCESS,
        description: `Password reset OTP requested for user: ${email}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata: { email },
      }).catch((err) => console.error("Audit log error:", err));

      res.status(200).json({
        success: true,
        message: "If the email exists, an OTP will be sent",
      });
    } catch (error: any) {
      res.status(429).json({
        success: false,
        error: error.message,
      });
    }
  }

  static verifyOTP = async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    await body("email").isEmail().withMessage("Invalid email").run(req);
    await body("otp").isLength({ min: 6, max: 6 }).isNumeric().run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const userRepository = dbConnection.getRepository(User);
    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      res.status(404).json({
        success: false,
        error: "Invalid email or OTP",
      });
      return;
    }

    const otpService = new OtpService(
      dbConnection.getRepository(OtpToken),
      userRepository
    );

    try {
      await otpService.verifyOTP(user.id, otp);

      const resetToken = jwt.sign(
        { userId: user.id, type: "password-reset" },
        process.env.JWT_SECRET!,
        { expiresIn: "15m" }
      );

      // Audit: OTP verified for password reset
      SecurityService.createAuditLog({
        action: AuditAction.PASSWORD_RESET_REQUEST,
        resource: AuditResource.USER,
        resourceId: String(user.id),
        userId: user.id,
        organizationId: user.organizationId ?? undefined,
        status: AuditStatus.SUCCESS,
        description: `Password reset OTP verified successfully for user: ${email}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata: { email, step: "otp_verified" },
      }).catch((err) => console.error("Audit log error:", err));

      res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        resetToken,
      });
    } catch (error: any) {
      // Audit: OTP verification failed
      SecurityService.createAuditLog({
        action: AuditAction.PASSWORD_RESET_REQUEST,
        resource: AuditResource.USER,
        resourceId: String(user.id),
        userId: user.id,
        organizationId: user.organizationId ?? undefined,
        status: AuditStatus.FAILURE,
        description: `Password reset OTP verification failed for user: ${email}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata: { email, reason: "otp_invalid", error: error.message },
      }).catch((err) => console.error("Audit log error:", err));

      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  static async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const { resetToken, newPassword } = req.body;

    await body("resetToken")
      .notEmpty()
      .withMessage("Reset token is required")
      .run(req);
    await body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    try {
      const decoded: any = jwt.verify(resetToken, process.env.JWT_SECRET!);
      if (decoded.type !== "password-reset") {
        throw new Error("Invalid reset token");
      }

      const userRepository = dbConnection.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: decoded.userId },
      });
      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      user.hashedPassword = await bcrypt.hash(newPassword, 12);
      user.isFirstLogin = false;
      await userRepository.save(user);

      // Audit: password reset completed
      SecurityService.createAuditLog({
        action: AuditAction.PASSWORD_RESET,
        resource: AuditResource.USER,
        resourceId: String(user.id),
        userId: user.id,
        organizationId: user.organizationId ?? undefined,
        status: AuditStatus.SUCCESS,
        description: `Password reset successfully completed for user: ${user.email}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata: { email: user.email },
      }).catch((err) => console.error("Audit log error:", err));

      res.status(200).json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      const result = await authService.getUserProfile(req.user.id);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching profile",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async updateProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      // ── Collect text fields ──────────────────────────────────────────────────
      const updateData: Record<string, any> = { ...req.body };

      // ── Handle profilePicture upload ─────────────────────────────────────────
      const files = req.files as
        | Record<string, Express.Multer.File[]>
        | undefined;

      if (files?.profilePicture?.[0]) {
        const uploaded = await UploadToCloud(files.profilePicture[0]);
        updateData.profilePicture = uploaded.secure_url;
      }

      // ── Handle employeeSignature upload (image treated same as profilePicture) ─
      if (files?.employeeSignature?.[0]) {
        const uploaded = await UploadToCloud(files.employeeSignature[0]);
        updateData.employeeSignature = uploaded.secure_url;
      }

      const result = await authService.updateUserProfile(
        req.user.id,
        updateData
      );

      if (result.success) {
        // Audit: profile updated
        SecurityService.createAuditLog({
          action: AuditAction.USER_UPDATED,
          resource: AuditResource.USER,
          resourceId: String(req.user.id),
          userId: req.user.id,
          organizationId: req.user.organizationId ?? undefined,
          status: AuditStatus.SUCCESS,
          description: `User profile updated for: ${req.user.email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: {
            updatedFields: Object.keys(updateData).filter(
              (k) => k !== "hashedPassword"
            ),
          },
        }).catch((err) => console.error("Audit log error:", err));

        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error during profile update",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async logout(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const token =
        req.headers.authorization?.replace("Bearer ", "") || "";

      // Audit: logout — fire before calling authService so we still have user context
      if (req.user) {
        SecurityService.createAuditLog({
          action: AuditAction.LOGOUT,
          resource: AuditResource.USER,
          resourceId: String(req.user.id),
          userId: req.user.id,
          organizationId: req.user.organizationId ?? undefined,
          status: AuditStatus.SUCCESS,
          description: `User logged out: ${req.user.email}`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
          metadata: { email: req.user.email, role: req.user.role },
        }).catch((err) => console.error("Audit log error:", err));
      }

      const result = await authService.logout(token);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error during logout",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async verifyToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          success: false,
          message: "Token is required",
        });
        return;
      }

      const result = await authService.verifyToken(token);

      if (result.valid) {
        res.status(200).json({
          success: true,
          message: "Token is valid",
          data: result.decoded,
        });
      } else {
        res.status(401).json({
          success: false,
          message: result.error || "Invalid token",
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error during token verification",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async refreshToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      const userResult = await authService.getUserProfile(req.user.id);

      if (!userResult.success || !userResult.data) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          user: userResult.data.user,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error during token refresh",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}

export default AuthController;