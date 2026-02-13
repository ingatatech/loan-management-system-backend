import { Router } from "express";
import { body, param, query } from "express-validator";
import { UserController } from "../controllers/userController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { requireClientRole } from "../middleware/rbacs";
import { UserRole } from "../entities/User";

const router = Router({ mergeParams: true });
const userController = new UserController();

// Apply authentication and tenant isolation to all routes
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

/**
 * Create a new user (Loan Officer, Board Director, Senior Manager, Managing Director)
 * POST /api/organizations/:organizationId/users
 * Only CLIENT role can create users
 */
router.post(
  "/",
  requireClientRole,
  [
    body("firstName")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("First name must be between 2 and 100 characters"),
    
    body("lastName")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Last name must be between 2 and 100 characters"),
    
    body("email")
      .isEmail()
      .withMessage("Valid email is required")
      .normalizeEmail(),
    
    body("phone")
      .optional()
      .trim()
      .isLength({ min: 10, max: 20 })
      .withMessage("Phone number must be between 10 and 20 characters"),
    
    // ✅ UPDATED: Added BUSINESS_OFFICER to allowed roles
    body("role")
      .isIn([
        UserRole.LOAN_OFFICER,
        UserRole.BOARD_DIRECTOR,
        UserRole.SENIOR_MANAGER,
        UserRole.MANAGING_DIRECTOR,
        UserRole.BUSINESS_OFFICER
      ])
      .withMessage(`Role must be one of: Loan Officer, Board Director, Senior Manager, Managing Director, Business Officer`),
    
    handleValidationErrors,
  ],
  userController.createUser
);

/**
 * Get all users in organization
 * GET /api/organizations/:organizationId/users
 */
router.get(
  "/",
  [
    query("role")
      .optional()
      .isIn(Object.values(UserRole))
      .withMessage(`Role must be one of: ${Object.values(UserRole).join(", ")}`),
    
    query("search")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),
    
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    
    handleValidationErrors,
  ],
  userController.getAllUsers
);

/**
 * Get user by ID with details
 * GET /api/organizations/:organizationId/users/:userId
 */
router.get(
  "/:userId",
  requireClientRole,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  userController.getUserById
);

/**
 * Update user information
 * PUT /api/organizations/:organizationId/users/:userId
 */
router.put(
  "/:userId",
  requireClientRole,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer"),
    
    body("firstName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("First name must be between 2 and 100 characters"),
    
    body("lastName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Last name must be between 2 and 100 characters"),
    
    body("phone")
      .optional()
      .trim()
      .isLength({ min: 10, max: 20 })
      .withMessage("Phone number must be between 10 and 20 characters"),
    
    body("isActive")
      .optional()
      .isBoolean()
      .withMessage("isActive must be a boolean value"),
    
    handleValidationErrors,
  ],
  userController.updateUser
);

/**
 * Deactivate user and optionally reassign loans
 * PATCH /api/organizations/:organizationId/users/:userId/deactivate
 */
router.patch(
  "/:userId/deactivate",
  requireClientRole,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer"),
    
    body("reassignTo")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Reassign to must be a valid user ID"),
    
    body("reason")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Reason must not exceed 500 characters"),
    
    handleValidationErrors,
  ],
  userController.deactivateUser
);

/**
 * Reset user password
 * POST /api/organizations/:organizationId/users/:userId/reset-password
 */
router.post(
  "/:userId/reset-password",
  requireClientRole,
  [
    param("userId")
      .isInt({ min: 1 })
      .withMessage("User ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  userController.resetUserPassword
);

export default router;