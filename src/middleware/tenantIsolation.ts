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

    
    // Extract JWT token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Access denied. No valid token provided.",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    
    // Get user repository
    const userRepository = dbConnection.getRepository(User);
    
    // Find the user with organization relation
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

    if (!user.isActive) {
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


    const requestedOrgId = parseInt(req.params.organizationId || req.params.orgId || "0");

    // Handle different user roles
    if (user.role === UserRole.SYSTEM_OWNER) {
      req.organizationId = requestedOrgId || undefined;
      next();
      return;
    }

    if (user.role === UserRole.CLIENT) {
      
      if (!user.organization) {
        res.status(403).json({
          success: false,
          message: "No organization assigned to user.",
        });
        return;
      }

      if (!user.organization.isActive) {
        res.status(403).json({
          success: false,
          message: "Organization is inactive.",
        });
        return;
      }

      if (requestedOrgId && requestedOrgId !== user.organization.id) {

        
        logTenantIsolationViolation(user.id, user.organization.id, requestedOrgId, req);
        res.status(403).json({
          success: false,
          message: "Access denied. Cannot access data from other organizations.",
        });
        return;
      }

      // Set organization context for client
      req.organizationId = user.organization.id;
    }

    next();
  } catch (error: any) {

    
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

    
    if (req.user?.role === UserRole.SYSTEM_OWNER) {
      next();
      return;
    }

    if (req.user?.role === UserRole.CLIENT) {
      const requestedOrgId = parseInt(req.params.organizationId || req.params.orgId || req.body.organizationId || "0");
      

      
      if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
        logTenantIsolationViolation(req.user.id, req.user.organizationId, requestedOrgId, req);
        res.status(403).json({
          success: false,
          message: "Access denied. You can only access your organization's data.",
        });
        return;
      }
    }


    next();
  } catch (error) {
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