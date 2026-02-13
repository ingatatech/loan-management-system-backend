import { Router } from "express";
import { body, param, query } from "express-validator";
import OrganizationController from "../controllers/organizationController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { requireSystemOwner, requirePermission, Permission } from "../middleware/rbac";
import {  validateId, validatePagination, handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { uploadFields, handleMulterError } from "../helpers/multer";

const router = Router();

router.use(authenticate);
router.use(checkFirstLogin);

router.post(
  "/",
  requireSystemOwner,
  [
    body("name")
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Organization name must be between 2 and 255 characters")
      .matches(/^[A-Za-z0-9\s\-._]+$/)
      .withMessage("Organization name contains invalid characters"),
    
    body("selectedCategories")
      .isArray({ min: 1 })
      .withMessage("At least one category must be selected"),
    
    
    body("adminUser.username")
      .trim()
      .isLength({ min: 3, max: 255 })
      .withMessage("Admin username must be between 3 and 255 characters"),
    
    body("adminUser.email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid admin email address"),
    

    handleValidationErrors,
  ],
  OrganizationController.createOrganization
);

router.get(
  "/",
  validatePagination,
  OrganizationController.getAllOrganizations
);


router.get(
  "/:id",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    query("include")
      .optional()
      .isIn(["true", "false"])
      .withMessage("Include parameter must be 'true' or 'false'"),
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  OrganizationController.getOrganizationById
);


router.put(
  "/:id",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),
    
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Organization name must be between 2 and 255 characters")
      .matches(/^[A-Za-z0-9\s\-._]+$/)
      .withMessage("Organization name contains invalid characters"),
    
    body("selectedCategories")
      .optional()
      .isArray({ min: 1 })
      .withMessage("At least one category must be selected"),
    
    body("tinNumber")
      .optional()
      .trim()
      .isLength({ min: 5, max: 50 })
      .withMessage("TIN number must be between 5 and 50 characters"),
    
    body("website")
      .optional()
      .isURL()
      .withMessage("Please provide a valid website URL"),
    
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.UPDATE_ORGANIZATION),
  OrganizationController.updateOrganization
);


router.post(
  "/:id/logo",
  validateId,
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.UPDATE_ORGANIZATION),
  uploadFields,
  handleMulterError,
  OrganizationController.uploadLogo
);


router.get(
  "/:id/stats",
  validateId,
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.VIEW_OWN_ORGANIZATION),
  OrganizationController.getOrganizationStats
);


router.post(
  "/:id/activate",
  validateId,
  requireSystemOwner,
  OrganizationController.activateOrganization
);


router.post(
  "/:id/deactivate",
  validateId,
  requireSystemOwner,
  OrganizationController.deactivateOrganization
);


router.delete(
  "/:id",
  validateId,
  requireSystemOwner,
  OrganizationController.deleteOrganization
);







router.post(
  "/:id/branches",

  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.UPDATE_ORGANIZATION),
  OrganizationController.addBranchToOrganization
);

router.put(
  "/:id/branches/:branchIndex",
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.UPDATE_ORGANIZATION),
  OrganizationController.updateBranch
);

router.delete(
  "/:id/branches/:branchIndex",
  [
    param("id").isInt({ min: 1 }).withMessage("Organization ID must be a positive integer"),
    param("branchIndex").isInt({ min: 0 }).withMessage("Branch index must be a non-negative integer"),
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.UPDATE_ORGANIZATION),
  OrganizationController.deleteBranch
);

router.post(
  "/:id/branches/:branchIndex/toggle",
  [
    param("id").isInt({ min: 1 }).withMessage("Organization ID must be a positive integer"),
    param("branchIndex").isInt({ min: 0 }).withMessage("Branch index must be a non-negative integer"),
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  requirePermission(Permission.UPDATE_ORGANIZATION),
  OrganizationController.toggleBranchStatus
);

router.get(
  "/:id/branches",
  [
    param("id").isInt({ min: 1 }).withMessage("Organization ID must be a positive integer"),
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  OrganizationController.getBranches
);
export default router;