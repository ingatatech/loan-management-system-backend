// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, UserRole } from "../entities/User";
import dbConnection from "../db";

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: UserRole;
    organizationId: number | null;
  };
  organizationId?: number;
}

interface JWTPayload {
  userId: number;
  role: UserRole;
  organizationId: number;
}

export const tenantIsolationMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    console.log("=== TENANT ISOLATION MIDDLEWARE DEBUG START ===");
    console.log("Request URL:", req.originalUrl);
    console.log("Request Method:", req.method);
    console.log("Request Params:", req.params);
    
    // Extract JWT token from Authorization header
    const authHeader = req.headers.authorization;
    console.log("Authorization Header Present:", !!authHeader);
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("ERROR: No valid authorization header");
      res.status(401).json({
        success: false,
        message: "Access denied. No valid token provided.",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    console.log("Token extracted, length:", token.length);
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    console.log("JWT Decoded payload:", {
      userId: decoded.userId,
      role: decoded.role,
      organizationId: decoded.organizationId
    });
    
    // Get user repository
    const userRepository = dbConnection.getRepository(User);
    
    // Find the user with organization relation
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
      relations: ["organization"],
    });

    console.log("User found in database:", {
      exists: !!user,
      id: user?.id,
      role: user?.role,
      isActive: user?.isActive,
      organizationId: user?.organization?.id,
      organizationActive: user?.organization?.isActive
    });

    if (!user) {
      console.log("ERROR: User not found in database");
      res.status(401).json({
        success: false,
        message: "Invalid token. User not found.",
      });
      return;
    }

    if (!user.isActive) {
      console.log("ERROR: User account is deactivated");
      res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact administrator.",
      });
      return;
    }

    // Set user context
    req.user = {
      id: user.id,
      role: user.role,
      organizationId: user.organization?.id || null,
    };

    console.log("User context set:", req.user);

    // Extract requested organization ID from URL params
    const requestedOrgId = parseInt(req.params.organizationId || req.params.orgId || "0");
    console.log("Requested Organization ID from URL:", requestedOrgId);

    // Handle different user roles
    if (user.role === UserRole.SYSTEM_OWNER) {
      console.log("SYSTEM_OWNER access granted - no tenant isolation");
      req.organizationId = requestedOrgId || undefined;
      next();
      return;
    }

    if (user.role === UserRole.CLIENT) {
      console.log("CLIENT role detected - enforcing tenant isolation");
      
      if (!user.organization) {
        console.log("ERROR: CLIENT user has no organization assigned");
        res.status(403).json({
          success: false,
          message: "No organization assigned to user.",
        });
        return;
      }

      if (!user.organization.isActive) {
        console.log("ERROR: CLIENT user's organization is inactive");
        res.status(403).json({
          success: false,
          message: "Organization is inactive.",
        });
        return;
      }

      // Validate that the user is accessing their own organization
      if (requestedOrgId && requestedOrgId !== user.organization.id) {
        console.log("ERROR: Tenant isolation violation detected", {
          userOrgId: user.organization.id,
          requestedOrgId: requestedOrgId,
          userRole: user.role
        });
        
        logTenantIsolationViolation(user.id, user.organization.id, requestedOrgId, req);
        res.status(403).json({
          success: false,
          message: "Access denied. Cannot access data from other organizations.",
        });
        return;
      }

      // Set organization context for client
      req.organizationId = user.organization.id;
      console.log("CLIENT access granted to organization:", req.organizationId);
    }

    console.log("=== TENANT ISOLATION MIDDLEWARE DEBUG END ===");
    next();
  } catch (error: any) {
    console.error("=== TENANT ISOLATION MIDDLEWARE ERROR ===");
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : "Stack trace hidden"
    });
    
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

    res.status(500).json({
      success: false,
      message: "Internal server error in tenant isolation.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Validation middleware for organization ownership
export const validateOrganizationOwnership = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    console.log("=== VALIDATE ORGANIZATION OWNERSHIP DEBUG START ===");
    console.log("User:", req.user);
    console.log("Request params:", req.params);
    
    // System owners can access any organization
    if (req.user?.role === UserRole.SYSTEM_OWNER) {
      console.log("SYSTEM_OWNER - ownership validation bypassed");
      next();
      return;
    }

    // Client users can only access their own organization
    if (req.user?.role === UserRole.CLIENT) {
      const requestedOrgId = parseInt(req.params.organizationId || req.params.orgId || req.body.organizationId || "0");
      
      console.log("CLIENT ownership validation:", {
        userOrgId: req.user.organizationId,
        requestedOrgId: requestedOrgId,
        match: requestedOrgId === req.user.organizationId
      });
      
      if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
        console.log("ERROR: Organization ownership validation failed");
        logTenantIsolationViolation(req.user.id, req.user.organizationId, requestedOrgId, req);
        res.status(403).json({
          success: false,
          message: "Access denied. You can only access your organization's data.",
        });
        return;
      }
    }

    console.log("Organization ownership validation passed");
    console.log("=== VALIDATE ORGANIZATION OWNERSHIP DEBUG END ===");
    next();
  } catch (error) {
    console.error("Organization ownership validation error:", error);
    res.status(500).json({
      success: false,
      message: "Error validating organization ownership.",
    });
  }
};

// Middleware to inject organization filter into all database queries
export const injectOrganizationFilter = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  // Skip for system owners
  if (req.user?.role === UserRole.SYSTEM_OWNER) {
    next();
    return;
  }

  // Inject organization filter for client users
  if (req.user?.role === UserRole.CLIENT && req.organizationId) {
    // Store original repository methods and add organization filtering
    const originalRepository = dbConnection.getRepository;
    
    dbConnection.getRepository = function<T>(entity: any) {
      const repository = originalRepository.call(this, entity);
      
      // Override find methods to automatically add organization filter
      const originalFind = repository.find;
      const originalFindOne = repository.findOne;
      const originalCount = repository.count;
      
      repository.find = function(options: any = {}) {
        if (shouldApplyOrganizationFilter(entity)) {
          options.where = options.where || {};
          if (Array.isArray(options.where)) {
            options.where = options.where.map((condition: any) => ({
              ...condition,
              organizationId: req.organizationId,
            }));
          } else {
            options.where.organizationId = req.organizationId;
          }
        }
        return originalFind.call(this, options);
      };
      
      repository.findOne = function(options: any = {}) {
        if (shouldApplyOrganizationFilter(entity)) {
          options.where = options.where || {};
          if (!options.where.organizationId) {
            options.where.organizationId = req.organizationId;
          }
        }
        return originalFindOne.call(this, options);
      };
      
      repository.count = function(options: any = {}) {
        if (shouldApplyOrganizationFilter(entity)) {
          options.where = options.where || {};
          options.where.organizationId = req.organizationId;
        }
        return originalCount.call(this, options);
      };
      
      return repository;
    };
  }

  next();
};

// Helper function to determine if organization filter should be applied
function shouldApplyOrganizationFilter(entity: any): boolean {
  const entitiesWithOrganization = [
    'Category',
    'Service', 
    'IndividualShareholder',
    'InstitutionShareholder',
    'ShareCapital',
    'Borrowing',
    'GrantedFunds',
    'OperationalFunds',
    'BoardDirector',
    'SeniorManagement'
  ];
  
  return entitiesWithOrganization.includes(entity.name);
}

// Security logging function for tenant isolation violations
function logTenantIsolationViolation(
  userId: number,
  userOrgId: number | null,
  attemptedOrgId: number,
  req: AuthenticatedRequest
): void {
  const violation = {
    timestamp: new Date().toISOString(),
    userId,
    userOrganizationId: userOrgId,
    attemptedOrganizationId: attemptedOrgId,
    route: req.route?.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    severity: 'HIGH',
    type: 'TENANT_ISOLATION_VIOLATION',
  };

  console.error('SECURITY ALERT - Tenant Isolation Violation:', violation);
  
  // In production, you might want to send this to a security monitoring service
  // or store in a dedicated security log table
}

// Middleware to prevent cross-tenant data access in request body
export const sanitizeRequestBody = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role === UserRole.CLIENT && req.organizationId) {
    // Ensure organizationId in body matches user's organization
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      req.body.organizationId = req.organizationId;
    }
    
    // Add organizationId to body if not present
    if (!req.body.organizationId) {
      req.body.organizationId = req.organizationId;
    }
  }

  next();
};

export default tenantIsolationMiddleware;