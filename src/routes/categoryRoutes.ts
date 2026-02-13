import { Router } from "express";
import { body, param, query } from "express-validator";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { requirePermission, Permission } from "../middleware/rbac";
import {  handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import CategoryController from "../controllers/categoryController";
const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(checkFirstLogin);

/**
 * POST /organizations/:organizationId/categories
 * Create a new category
 */
router.post(
  "/:organizationId/categories",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    body("name")
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Category name must be between 2 and 255 characters"),
    
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    
    body("categoryCode")
      .optional()
      .trim()
      .isLength({ max: 10 })
      .withMessage("Category code must not exceed 10 characters"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  CategoryController.createCategory
);

/**
 * PUT /organizations/:organizationId/categories/:id
 * Update category
 */
router.put(
  "/:organizationId/categories/:id",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Category name must be between 2 and 255 characters"),
    
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    
    body("categoryCode")
      .optional()
      .trim()
      .isLength({ max: 10 })
      .withMessage("Category code must not exceed 10 characters"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  CategoryController.updateCategory
);

/**
 * GET /organizations/:organizationId/categories/:id
 * Get category by ID
 */
router.get(
  "/:organizationId/categories/:id",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    query("includeServices")
      .optional()
      .isIn(["true", "false"])
      .withMessage("includeServices must be 'true' or 'false'"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.VIEW_CATEGORIES),
  CategoryController.getCategoryById
);

/**
 * GET /organizations/:organizationId/categories
 * Get categories with pagination and search
 */
router.get(
  "/:organizationId/categories",
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
    
    query("includeServices")
      .optional()
      .isIn(["true", "false"])
      .withMessage("includeServices must be 'true' or 'false'"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.VIEW_CATEGORIES),
  CategoryController.getCategories
);

/**
 * DELETE /organizations/:organizationId/categories/:id
 * Delete category
 */
router.delete(
  "/:organizationId/categories/:id",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  CategoryController.deleteCategory
);

/**
 * POST /organizations/:organizationId/categories/:id/activate
 * Activate category
 */
router.post(
  "/:organizationId/categories/:id/activate",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  CategoryController.activateCategory
);

/**
 * POST /organizations/:organizationId/categories/:id/deactivate
 * Deactivate category
 */
router.post(
  "/:organizationId/categories/:id/deactivate",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  CategoryController.deactivateCategory
);

export default router;