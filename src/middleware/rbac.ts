// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { UserRole } from "../entities/User";

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: UserRole;
    organizationId: number | null;
    username: string;
    email: string;
  };
}

export enum Permission {
  // Organization management
  CREATE_ORGANIZATION = "create_organization",
  UPDATE_ORGANIZATION = "update_organization",
  DELETE_ORGANIZATION = "delete_organization",
  VIEW_ALL_ORGANIZATIONS = "view_all_organizations",
  VIEW_OWN_ORGANIZATION = "view_own_organization",
  
  // Category management
  CREATE_CATEGORY = "create_category",
  UPDATE_CATEGORY = "update_category",
  DELETE_CATEGORY = "delete_category",
  VIEW_CATEGORIES = "view_categories",
  
  // Service management
  CREATE_SERVICE = "create_service",
  UPDATE_SERVICE = "update_service",
  DELETE_SERVICE = "delete_service",
  VIEW_SERVICES = "view_services",
  
  // Shareholder management
  CREATE_SHAREHOLDER = "create_shareholder",
  UPDATE_SHAREHOLDER = "update_shareholder",
  DELETE_SHAREHOLDER = "delete_shareholder",
  VIEW_SHAREHOLDERS = "view_shareholders",
  
  // Share capital management
  CREATE_SHARE_CAPITAL = "create_share_capital",
  UPDATE_SHARE_CAPITAL = "update_share_capital",
  DELETE_SHARE_CAPITAL = "delete_share_capital",
  VIEW_SHARE_CAPITAL = "view_share_capital",
  
  // Funding management
  CREATE_BORROWING = "create_borrowing",
  UPDATE_BORROWING = "update_borrowing",
  DELETE_BORROWING = "delete_borrowing",
  VIEW_BORROWING = "view_borrowing",
  
  CREATE_GRANTED_FUNDS = "create_granted_funds",
  UPDATE_GRANTED_FUNDS = "update_granted_funds",
  DELETE_GRANTED_FUNDS = "delete_granted_funds",
  VIEW_GRANTED_FUNDS = "view_granted_funds",
  
  CREATE_OPERATIONAL_FUNDS = "create_operational_funds",
  UPDATE_OPERATIONAL_FUNDS = "update_operational_funds",
  DELETE_OPERATIONAL_FUNDS = "delete_operational_funds",
  VIEW_OPERATIONAL_FUNDS = "view_operational_funds",
  
  // Management team
  CREATE_BOARD_DIRECTOR = "create_board_director",
  UPDATE_BOARD_DIRECTOR = "update_board_director",
  DELETE_BOARD_DIRECTOR = "delete_board_director",
  VIEW_BOARD_DIRECTORS = "view_board_directors",
  
  CREATE_SENIOR_MANAGEMENT = "create_senior_management",
  UPDATE_SENIOR_MANAGEMENT = "update_senior_management",
  DELETE_SENIOR_MANAGEMENT = "delete_senior_management",
  VIEW_SENIOR_MANAGEMENT = "view_senior_management",
  
  // File management
  UPLOAD_FILES = "upload_files",
  DELETE_FILES = "delete_files",
  
  // System administration
  MANAGE_USERS = "manage_users",
  VIEW_SYSTEM_ANALYTICS = "view_system_analytics",
  SYSTEM_SETTINGS = "system_settings",

  // Loan Management (NEW PERMISSIONS)
  VIEW_LOAN_APPLICATIONS = "view_loan_applications",
  APPROVE_LOAN_APPLICATIONS = "approve_loan_applications",
  REJECT_LOAN_APPLICATIONS = "reject_loan_applications",
  MANAGE_LOAN_PORTFOLIO = "manage_loan_portfolio",
  VIEW_LOAN_REPORTS = "view_loan_reports",

  // Borrower Management (NEW PERMISSIONS)
  VIEW_BORROWERS = "view_borrowers",
  CREATE_BORROWERS = "create_borrowers",
  UPDATE_BORROWERS = "update_borrowers",

  // Collateral Management (NEW PERMISSIONS)
  VIEW_COLLATERALS = "view_collaterals",
  MANAGE_COLLATERALS = "manage_collaterals",

  // Dashboard & Analytics (NEW PERMISSIONS)
  VIEW_DASHBOARD = "view_dashboard",
  VIEW_FINANCIAL_REPORTS = "view_financial_reports",
}

// Role-permission mapping
const rolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.SYSTEM_OWNER]: [
    // System owners have all permissions
    Permission.CREATE_ORGANIZATION,
    Permission.UPDATE_ORGANIZATION,
    Permission.DELETE_ORGANIZATION,
    Permission.VIEW_ALL_ORGANIZATIONS,
    Permission.VIEW_OWN_ORGANIZATION,
    Permission.CREATE_CATEGORY,
    Permission.UPDATE_CATEGORY,
    Permission.DELETE_CATEGORY,
    Permission.VIEW_CATEGORIES,
    Permission.CREATE_SERVICE,
    Permission.UPDATE_SERVICE,
    Permission.DELETE_SERVICE,
    Permission.VIEW_SERVICES,
    Permission.CREATE_SHAREHOLDER,
    Permission.UPDATE_SHAREHOLDER,
    Permission.DELETE_SHAREHOLDER,
    Permission.VIEW_SHAREHOLDERS,
    Permission.CREATE_SHARE_CAPITAL,
    Permission.UPDATE_SHARE_CAPITAL,
    Permission.DELETE_SHARE_CAPITAL,
    Permission.VIEW_SHARE_CAPITAL,
    Permission.CREATE_BORROWING,
    Permission.UPDATE_BORROWING,
    Permission.DELETE_BORROWING,
    Permission.VIEW_BORROWING,
    Permission.CREATE_GRANTED_FUNDS,
    Permission.UPDATE_GRANTED_FUNDS,
    Permission.DELETE_GRANTED_FUNDS,
    Permission.VIEW_GRANTED_FUNDS,
    Permission.CREATE_OPERATIONAL_FUNDS,
    Permission.UPDATE_OPERATIONAL_FUNDS,
    Permission.DELETE_OPERATIONAL_FUNDS,
    Permission.VIEW_OPERATIONAL_FUNDS,
    Permission.CREATE_BOARD_DIRECTOR,
    Permission.UPDATE_BOARD_DIRECTOR,
    Permission.DELETE_BOARD_DIRECTOR,
    Permission.VIEW_BOARD_DIRECTORS,
    Permission.CREATE_SENIOR_MANAGEMENT,
    Permission.UPDATE_SENIOR_MANAGEMENT,
    Permission.DELETE_SENIOR_MANAGEMENT,
    Permission.VIEW_SENIOR_MANAGEMENT,
    Permission.UPLOAD_FILES,
    Permission.DELETE_FILES,
    Permission.MANAGE_USERS,
    Permission.VIEW_SYSTEM_ANALYTICS,
    Permission.SYSTEM_SETTINGS,
    // NEW: Loan Management Permissions
    Permission.VIEW_LOAN_APPLICATIONS,
    Permission.APPROVE_LOAN_APPLICATIONS,
    Permission.REJECT_LOAN_APPLICATIONS,
    Permission.MANAGE_LOAN_PORTFOLIO,
    Permission.VIEW_LOAN_REPORTS,
    Permission.VIEW_BORROWERS,
    Permission.CREATE_BORROWERS,
    Permission.UPDATE_BORROWERS,
    Permission.VIEW_COLLATERALS,
    Permission.MANAGE_COLLATERALS,
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_FINANCIAL_REPORTS,
  ],

  [UserRole.CLIENT]: [
    // Client users can manage their own organization's data
    Permission.VIEW_OWN_ORGANIZATION,
    Permission.UPDATE_ORGANIZATION,
    Permission.CREATE_CATEGORY,
    Permission.UPDATE_CATEGORY,
    Permission.DELETE_CATEGORY,
    Permission.VIEW_CATEGORIES,
    Permission.CREATE_SERVICE,
    Permission.UPDATE_SERVICE,
    Permission.DELETE_SERVICE,
    Permission.VIEW_SERVICES,
    Permission.CREATE_SHAREHOLDER,
    Permission.UPDATE_SHAREHOLDER,
    Permission.DELETE_SHAREHOLDER,
    Permission.VIEW_SHAREHOLDERS,
    Permission.CREATE_SHARE_CAPITAL,
    Permission.UPDATE_SHARE_CAPITAL,
    Permission.DELETE_SHARE_CAPITAL,
    Permission.VIEW_SHARE_CAPITAL,
    Permission.CREATE_BORROWING,
    Permission.UPDATE_BORROWING,
    Permission.DELETE_BORROWING,
    Permission.VIEW_BORROWING,
    Permission.CREATE_GRANTED_FUNDS,
    Permission.UPDATE_GRANTED_FUNDS,
    Permission.DELETE_GRANTED_FUNDS,
    Permission.VIEW_GRANTED_FUNDS,
    Permission.CREATE_OPERATIONAL_FUNDS,
    Permission.UPDATE_OPERATIONAL_FUNDS,
    Permission.DELETE_OPERATIONAL_FUNDS,
    Permission.VIEW_OPERATIONAL_FUNDS,
    Permission.CREATE_BOARD_DIRECTOR,
    Permission.UPDATE_BOARD_DIRECTOR,
    Permission.DELETE_BOARD_DIRECTOR,
    Permission.VIEW_BOARD_DIRECTORS,
    Permission.CREATE_SENIOR_MANAGEMENT,
    Permission.UPDATE_SENIOR_MANAGEMENT,
    Permission.DELETE_SENIOR_MANAGEMENT,
    Permission.VIEW_SENIOR_MANAGEMENT,
    Permission.UPLOAD_FILES,
    Permission.DELETE_FILES,
    // NEW: Loan Management Permissions for Client
    Permission.VIEW_LOAN_APPLICATIONS,
    Permission.APPROVE_LOAN_APPLICATIONS,
    Permission.REJECT_LOAN_APPLICATIONS,
    Permission.MANAGE_LOAN_PORTFOLIO,
    Permission.VIEW_LOAN_REPORTS,
    Permission.VIEW_BORROWERS,
    Permission.CREATE_BORROWERS,
    Permission.UPDATE_BORROWERS,
    Permission.VIEW_COLLATERALS,
    Permission.MANAGE_COLLATERALS,
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_FINANCIAL_REPORTS,
  ],

  [UserRole.MANAGER]: [
    // Manager permissions - focused on operational management
    Permission.VIEW_OWN_ORGANIZATION,
    
    // View permissions for organizational data
    Permission.VIEW_CATEGORIES,
    Permission.VIEW_SERVICES,
    Permission.VIEW_SHAREHOLDERS,
    Permission.VIEW_SHARE_CAPITAL,
    Permission.VIEW_BORROWING,
    Permission.VIEW_GRANTED_FUNDS,
    Permission.VIEW_OPERATIONAL_FUNDS,
    Permission.VIEW_BOARD_DIRECTORS,
    Permission.VIEW_SENIOR_MANAGEMENT,
    
    // File management
    Permission.UPLOAD_FILES,
    
    // Loan Management Permissions (Core functionality for managers)
    Permission.VIEW_LOAN_APPLICATIONS,
    Permission.APPROVE_LOAN_APPLICATIONS,
    Permission.REJECT_LOAN_APPLICATIONS,
    Permission.MANAGE_LOAN_PORTFOLIO,
    Permission.VIEW_LOAN_REPORTS,
    
    // Borrower Management
    Permission.VIEW_BORROWERS,
    Permission.CREATE_BORROWERS,
    Permission.UPDATE_BORROWERS,
    
    // Collateral Management
    Permission.VIEW_COLLATERALS,
    Permission.MANAGE_COLLATERALS,
    
    // Dashboard & Analytics
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_FINANCIAL_REPORTS,
  ],

  [UserRole.STAFF]: [
    // Staff permissions - limited view and operational tasks
    Permission.VIEW_OWN_ORGANIZATION,
    Permission.VIEW_CATEGORIES,
    Permission.VIEW_SERVICES,
    Permission.VIEW_SHAREHOLDERS,
    Permission.VIEW_BOARD_DIRECTORS,
    Permission.VIEW_SENIOR_MANAGEMENT,
    Permission.UPLOAD_FILES,
    Permission.VIEW_LOAN_APPLICATIONS,
    Permission.VIEW_BORROWERS,
    Permission.VIEW_COLLATERALS,
    Permission.VIEW_DASHBOARD,
  ],

  [UserRole.AUDITOR]: [
    // Auditor permissions - read-only access for auditing
    Permission.VIEW_OWN_ORGANIZATION,
    Permission.VIEW_CATEGORIES,
    Permission.VIEW_SERVICES,
    Permission.VIEW_SHAREHOLDERS,
    Permission.VIEW_SHARE_CAPITAL,
    Permission.VIEW_BORROWING,
    Permission.VIEW_GRANTED_FUNDS,
    Permission.VIEW_OPERATIONAL_FUNDS,
    Permission.VIEW_BOARD_DIRECTORS,
    Permission.VIEW_SENIOR_MANAGEMENT,
    Permission.VIEW_LOAN_APPLICATIONS,
    Permission.VIEW_LOAN_REPORTS,
    Permission.VIEW_BORROWERS,
    Permission.VIEW_COLLATERALS,
    Permission.VIEW_FINANCIAL_REPORTS,
  ],

  [UserRole.SUPPORT]: [
    // Support permissions - limited system access for support tasks
    Permission.VIEW_OWN_ORGANIZATION,
    Permission.VIEW_CATEGORIES,
    Permission.VIEW_SERVICES,
    Permission.VIEW_LOAN_APPLICATIONS,
    Permission.VIEW_BORROWERS,
    Permission.VIEW_DASHBOARD,
  ],
};

// Check if user has specific permission
export const hasPermission = (userRole: UserRole, permission: Permission): boolean => {
  const permissions = rolePermissions[userRole];
  // Handle case where role is not defined in rolePermissions
  if (!permissions) {
    console.warn(`No permissions defined for role: ${userRole}`);
    return false;
  }
  return permissions.includes(permission);
};

// Middleware to check if user has required permission
export const requirePermission = (permission: Permission) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
        return;
      }

      if (!hasPermission(req.user.role, permission)) {
        res.status(403).json({
          success: false,
          message: "Access denied. Insufficient permissions.",
          required_permission: permission,
          user_role: req.user.role,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({
        success: false,
        message: "Error checking permissions.",
      });
    }
  };
};

// Middleware to check if user has any of the required permissions
export const requireAnyPermission = (permissions: Permission[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
        return;
      }

      const hasAnyPermission = permissions.some(permission => 
        hasPermission(req.user!.role, permission)
      );

      if (!hasAnyPermission) {
        res.status(403).json({
          success: false,
          message: "Access denied. None of the required permissions found.",
          required_permissions: permissions,
          user_role: req.user.role,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Multiple permission check error:", error);
      res.status(500).json({
        success: false,
        message: "Error checking permissions.",
      });
    }
  };
};

// Role-based middleware
export const requireRole = (roles: UserRole | UserRole[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
        return;
      }

      if (!allowedRoles.includes(req.user.role)) {
        res.status(403).json({
          success: false,
          message: "Access denied. Insufficient role privileges.",
          required_roles: allowedRoles,
          user_role: req.user.role,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Role check error:", error);
      res.status(500).json({
        success: false,
        message: "Error checking role.",
      });
    }
  };
};

// System owner only middleware
export const requireSystemOwner = requireRole(UserRole.SYSTEM_OWNER);

// Client user only middleware
export const requireClient = requireRole(UserRole.CLIENT);

// Manager user only middleware
export const requireManager = requireRole(UserRole.MANAGER);

// System owner or client middleware
export const requireSystemOwnerOrClient = requireRole([UserRole.SYSTEM_OWNER, UserRole.CLIENT]);

// System owner, client, or manager middleware
export const requireSystemOwnerOrClientOrManager = requireRole([UserRole.SYSTEM_OWNER, UserRole.CLIENT, UserRole.MANAGER]);

// Manager or client middleware (for loan operations)
export const requireManagerOrClient = requireRole([UserRole.MANAGER, UserRole.CLIENT]);

// Action-based permission middleware
export const requireAction = (resource: string, action: "create" | "read" | "update" | "delete") => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
        return;
      }

      // Map resource and action to permission
      const permissionMap: Record<string, Record<string, Permission>> = {
        organization: {
          create: Permission.CREATE_ORGANIZATION,
          read: Permission.VIEW_OWN_ORGANIZATION,
          update: Permission.UPDATE_ORGANIZATION,
          delete: Permission.DELETE_ORGANIZATION,
        },
        category: {
          create: Permission.CREATE_CATEGORY,
          read: Permission.VIEW_CATEGORIES,
          update: Permission.UPDATE_CATEGORY,
          delete: Permission.DELETE_CATEGORY,
        },
        service: {
          create: Permission.CREATE_SERVICE,
          read: Permission.VIEW_SERVICES,
          update: Permission.UPDATE_SERVICE,
          delete: Permission.DELETE_SERVICE,
        },
        shareholder: {
          create: Permission.CREATE_SHAREHOLDER,
          read: Permission.VIEW_SHAREHOLDERS,
          update: Permission.UPDATE_SHAREHOLDER,
          delete: Permission.DELETE_SHAREHOLDER,
        },
        funding: {
          create: Permission.CREATE_BORROWING,
          read: Permission.VIEW_BORROWING,
          update: Permission.UPDATE_BORROWING,
          delete: Permission.DELETE_BORROWING,
        },
        management: {
          create: Permission.CREATE_BOARD_DIRECTOR,
          read: Permission.VIEW_BOARD_DIRECTORS,
          update: Permission.UPDATE_BOARD_DIRECTOR,
          delete: Permission.DELETE_BOARD_DIRECTOR,
        },
        loan: {
          create: Permission.VIEW_LOAN_APPLICATIONS, // Note: create loans might be separate
          read: Permission.VIEW_LOAN_APPLICATIONS,
          update: Permission.APPROVE_LOAN_APPLICATIONS, // Approve/Reject are update actions
          delete: Permission.REJECT_LOAN_APPLICATIONS,
        },
        borrower: {
          create: Permission.CREATE_BORROWERS,
          read: Permission.VIEW_BORROWERS,
          update: Permission.UPDATE_BORROWERS,
          delete: Permission.UPDATE_BORROWERS, // Using update for delete as well
        },
        collateral: {
          create: Permission.MANAGE_COLLATERALS,
          read: Permission.VIEW_COLLATERALS,
          update: Permission.MANAGE_COLLATERALS,
          delete: Permission.MANAGE_COLLATERALS,
        },
      };

      const resourcePermissions = permissionMap[resource];
      if (!resourcePermissions) {
        res.status(400).json({
          success: false,
          message: `Unknown resource: ${resource}`,
        });
        return;
      }

      const requiredPermission = resourcePermissions[action];
      if (!requiredPermission) {
        res.status(400).json({
          success: false,
          message: `Unknown action: ${action} for resource: ${resource}`,
        });
        return;
      }

      if (!hasPermission(req.user.role, requiredPermission)) {
        res.status(403).json({
          success: false,
          message: `Access denied. Cannot ${action} ${resource}.`,
          required_permission: requiredPermission,
          user_role: req.user.role,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Action-based permission check error:", error);
      res.status(500).json({
        success: false,
        message: "Error checking action permissions.",
      });
    }
  };
};

// Get user permissions utility
export const getUserPermissions = (userRole: UserRole): Permission[] => {
  return rolePermissions[userRole] || [];
};

// Check multiple permissions utility
export const checkPermissions = (userRole: UserRole, permissions: Permission[]): boolean[] => {
  return permissions.map(permission => hasPermission(userRole, permission));
};

// Middleware to add user permissions to request context
export const addPermissionsToContext = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (req.user) {
      (req as any).userPermissions = getUserPermissions(req.user.role);
    }
    next();
  } catch (error) {
    console.error("Error adding permissions to context:", error);
    next();
  }
};

export default requirePermission;