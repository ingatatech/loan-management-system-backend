// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, UserRole } from "../entities/User";
import dbConnection from "../db";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: UserRole;
    organizationId: number | null;
    username: string;
    email: string;
  };
}

interface JWTPayload {
  userId: number;
  role: UserRole;
  organizationId: number;
  iat?: number;
  exp?: number;
}

// Main authentication middleware
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
      return;
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Access denied. Invalid token format.",
      });
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    // Get user from database
    const userRepository = dbConnection.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
      relations: ["organization"],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid token. User not found.",
      });
      return;
    }

    // Check if user account is active
    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact administrator.",
      });
      return;
    }

    // Check if user account is locked
    if (user.isAccountLocked()) {
      res.status(403).json({
        success: false,
        message: "Account is temporarily locked due to multiple failed login attempts.",
      });
      return;
    }

    // Check if organization is active (for client users)
    if (user.role === UserRole.CLIENT && user.organization && !user.organization.isActive) {
      res.status(403).json({
        success: false,
        message: "Organization account is deactivated.",
      });
      return;
    }

    // Set user context in request
    req.user = {
      id: user.id,
      role: user.role,
      organizationId: user.organization?.id || null,
      username: user.username,
      email: user.email,
    };

    next();
  } catch (error: any) {
    console.error("Authentication error:", error);

    if (error.name === "JsonWebTokenError") {
      res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
      return;
    }

    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        message: "Token expired. Please log in again.",
      });
      return;
    }

    if (error.name === "NotBeforeError") {
      res.status(401).json({
        success: false,
        message: "Token not yet valid.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Authentication server error.",
    });
  }
};

// Optional authentication middleware (for public routes that may benefit from user context)
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      next();
      return;
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      next();
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const userRepository = dbConnection.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
      relations: ["organization"],
    });

    if (user && user.isActive) {
      req.user = {
        id: user.id,
        role: user.role,
        organizationId: user.organization?.id || null,
        username: user.username,
        email: user.email,
      };
    }

    next();
  } catch (error) {
    // Silently fail for optional authentication
    next();
  }
};

// Middleware to refresh token if it's close to expiration
export const refreshTokenIfNeeded = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !req.user) {
      next();
      return;
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    
    // Check if token expires within 1 hour
    if (decoded.exp && decoded.exp * 1000 - Date.now() < 60 * 60 * 1000) {
      // Generate new token
      const newToken = jwt.sign(
        {
          userId: req.user.id,
          role: req.user.role,
          organizationId: req.user.organizationId,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "24h" }
      );

      // Set new token in response header
      res.setHeader("X-New-Token", newToken);
    }

    next();
  } catch (error) {
    // Don't fail the request if token refresh fails
    next();
  }
};

// Middleware to validate first login and force password reset
export const checkFirstLogin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next();
      return;
    }

    const userRepository = dbConnection.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: req.user.id },
    });

    if (user && user.isFirstLogin) {
      res.status(403).json({
        success: false,
        message: "First login detected. Password reset required.",
        requirePasswordReset: true,
      });
      return;
    }

    next();
  } catch (error) {
    console.error("First login check error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking first login status.",
    });
  }
};

// Middleware to log user activity
export const logUserActivity = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (req.user) {
      const activity = {
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        username: req.user.username,
        organizationId: req.user.organizationId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      };

      // Log to console (in production, you might want to use a proper logging service)
      console.log("User Activity:", JSON.stringify(activity));
    }

    next();
  } catch (error) {
    // Don't fail the request if logging fails
    next();
  }
};

// Utility function to generate JWT token
export const generateToken = (user: User): string => {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      organizationId: user.organization?.id || null,
    },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
  );
};

// Utility function to generate refresh token
export const generateRefreshToken = (user: User): string => {
  return jwt.sign(
    {
      userId: user.id,
      type: "refresh",
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
};

// Middleware to handle token blacklisting (for logout)
export const checkBlacklistedToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      next();
      return;
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    // In a production environment, you would check against a blacklist stored in Redis or database
    // For now, we'll just continue
    
    next();
  } catch (error) {
    console.error("Blacklist check error:", error);
    next();
  }
};

export default authenticate;