import { Router } from "express";
import { body, param, query } from "express-validator";
import ServiceController from "../controllers/serviceController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { requirePermission, Permission } from "../middleware/rbac";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(checkFirstLogin);

/**
 * POST /organizations/:organizationId/categories/:categoryId/services
 * Create a new service
 */
router.post(
  "/:organizationId/categories/:categoryId/services",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("categoryId")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    body("name")
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Service name must be between 2 and 255 characters"),
    
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    
    body("serviceCode")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Service code must not exceed 20 characters"),
    
    body("basePrice")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Base price must be a positive number"),
    
    body("interestRate")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Interest rate must be between 0 and 100"),
    
    body("minLoanAmount")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum loan amount must be a positive integer"),
    
    body("maxLoanAmount")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum loan amount must be a positive integer"),
    
    body("minTenureMonths")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Minimum tenure must be at least 1 month"),
    
    body("maxTenureMonths")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Maximum tenure must be at least 1 month"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ServiceController.createService
);

/**
 * PUT /organizations/:organizationId/services/:id
 * Update service
 */
router.put(
  "/:organizationId/services/:id",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Service ID must be a positive integer"),
    
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Service name must be between 2 and 255 characters"),
    
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    
    body("serviceCode")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Service code must not exceed 20 characters"),
    
    body("basePrice")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Base price must be a positive number"),
    
    body("interestRate")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Interest rate must be between 0 and 100"),
    
    body("minLoanAmount")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum loan amount must be a positive integer"),
    
    body("maxLoanAmount")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum loan amount must be a positive integer"),
    
    body("minTenureMonths")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Minimum tenure must be at least 1 month"),
    
    body("maxTenureMonths")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Maximum tenure must be at least 1 month"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ServiceController.updateService
);

/**
 * GET /organizations/:organizationId/services/:id
 * Get service by ID
 */
router.get(
  "/:organizationId/services/:id",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Service ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.VIEW_SERVICES),
  ServiceController.getServiceById
);

/**
 * GET /organizations/:organizationId/categories/:categoryId/services
 * Get services by category
 */
router.get(
  "/:organizationId/categories/:categoryId/services",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("categoryId")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    
    query("search")
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage("Search term must not exceed 255 characters"),
    
    query("isActive")
      .optional()
      .isIn(["true", "false"])
      .withMessage("isActive must be 'true' or 'false'"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.VIEW_SERVICES),
  ServiceController.getServices
);

/**
 * GET /organizations/:organizationId/services
 * Get all services for organization
 */
router.get(
  "/:organizationId/services",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    
    query("search")
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage("Search term must not exceed 255 characters"),
    
    query("isActive")
      .optional()
      .isIn(["true", "false"])
      .withMessage("isActive must be 'true' or 'false'"),
    
    query("categoryId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.VIEW_SERVICES),
  ServiceController.getServicesByOrganization
);

/**
 * DELETE /organizations/:organizationId/services/:id
 * Delete service
 */
router.delete(
  "/:organizationId/services/:id",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Service ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ServiceController.deleteService
);

/**
 * POST /organizations/:organizationId/services/:id/activate
 * Activate service
 */
router.post(
  "/:organizationId/services/:id/activate",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Service ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ServiceController.activateService
);

/**
 * POST /organizations/:organizationId/services/:id/deactivate
 * Deactivate service
 */
router.post(
  "/:organizationId/services/:id/deactivate",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Service ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ServiceController.deactivateService
);

export default router;