import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import { UserRole } from "../entities/User";

/**
 * Require CLIENT role for user management operations
 */
export const requireClientRole = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (req.user.role !== UserRole.CLIENT) {
    res.status(403).json({
      success: false,
      message: "Access denied. Only CLIENT role users can perform this action.",
    });
    return;
  }

  next();
};

/**
 * Require MANAGER role (for Directors/Senior Managers)
 */
export const requireManagerRole = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (req.user.role !== UserRole.MANAGER) {
    res.status(403).json({
      success: false,
      message: "Access denied. Only MANAGER role users can perform this action.",
    });
    return;
  }

  next();
};

/**
 * Require STAFF role (for Loan Officers)
 */
export const requireStaffRole = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (req.user.role !== UserRole.STAFF) {
    res.status(403).json({
      success: false,
      message: "Access denied. Only STAFF role users can perform this action.",
    });
    return;
  }

  next();
};

/**
 * Require CLIENT or MANAGER role (for operations both can do)
 */
export const requireClientOrManager = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (req.user.role !== UserRole.CLIENT && req.user.role !== UserRole.MANAGER) {
    res.status(403).json({
      success: false,
      message: "Access denied. Only CLIENT or MANAGER role users can perform this action.",
    });
    return;
  }

  next();
};

/**
 * Existing requireClient for backward compatibility
 */
export const requireClient = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  return requireClientRole(req, res, next);
};

/**
 * Check if user can review loan based on their role
 * This is used in loan review workflow
 */
export const canReviewLoan = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  // CLIENT and MANAGER can review loans
  const allowedRoles = [UserRole.CLIENT, UserRole.SENIOR_MANAGER, UserRole.MANAGING_DIRECTOR];
  
  if (!allowedRoles.includes(req.user.role)) {
    res.status(403).json({
      success: false,
      message: "Access denied. You don't have permission to review loans.",
    });
    return;
  }

  next();
};

/**
 * Verify user can access loan workflow
 */
export const canAccessWorkflow = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  // All authenticated users in organization can view workflow
  // Actual write permissions are handled by specific endpoints
  next();
};

/**
 * Permission constants for different operations
 */
export const PERMISSIONS = {
  // User Management
  CREATE_USER: [UserRole.CLIENT],
  VIEW_USERS: [UserRole.CLIENT],
  UPDATE_USER: [UserRole.CLIENT],
  DEACTIVATE_USER: [UserRole.CLIENT],
  
  // Loan Application
  CREATE_LOAN_APPLICATION: [UserRole.CLIENT, UserRole.STAFF],
  VIEW_LOAN_APPLICATIONS: [UserRole.CLIENT, UserRole.MANAGER, UserRole.STAFF],
  UPDATE_LOAN_APPLICATION: [UserRole.CLIENT, UserRole.MANAGER],
  DELETE_LOAN_APPLICATION: [UserRole.CLIENT],
  
  // Loan Review
  REVIEW_LOAN: [UserRole.CLIENT, UserRole.MANAGER],
  APPROVE_LOAN: [UserRole.CLIENT],
  REJECT_LOAN: [UserRole.CLIENT],
  
  // Loan Status Management
  CHANGE_LOAN_STATUS: [UserRole.CLIENT, UserRole.MANAGER],
  BULK_CHANGE_STATUS: [UserRole.CLIENT],
  
  // Management Team
  MANAGE_BOARD_DIRECTORS: [UserRole.CLIENT],
  MANAGE_SENIOR_MANAGEMENT: [UserRole.CLIENT],
  VIEW_MANAGEMENT_TEAM: [UserRole.CLIENT, UserRole.MANAGER],
  
  // Reports & Analytics
  VIEW_PORTFOLIO_SUMMARY: [UserRole.CLIENT, UserRole.MANAGER],
  VIEW_LOAN_STATISTICS: [UserRole.CLIENT, UserRole.MANAGER],
  GENERATE_REPORTS: [UserRole.CLIENT, UserRole.MANAGER]
};

/**
 * Generic permission checker
 */
export const requirePermission = (permission: keyof typeof PERMISSIONS) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const allowedRoles = PERMISSIONS[permission];
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
};