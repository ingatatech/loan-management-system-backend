import { Router } from "express";
import { body, param, query } from "express-validator";
import ClientBorrowerAccountController from "../controllers/clientBorrowerAccountController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { uploadFields, handleMulterError } from "../helpers/multer";

const router = Router({ mergeParams: true });

// Apply authentication and tenant isolation
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

/**
 * STEP 1: Create Client Borrower Permanent Account
 * POST /api/organizations/:organizationId/client-borrower-accounts
 * 
 * This is an independent endpoint that creates a client account
 * and auto-fills from loan and analysis reports
 */
router.post(
  "/",
  uploadFields,
  handleMulterError,
  [
    body("loanId")
      .isInt({ min: 1 })
      .withMessage("Valid loan ID is required"),

    body("contactPersonName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage("Contact person name must be between 2 and 200 characters"),

    body("contactPersonPosition")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Contact person position must be less than 100 characters"),

    body("contactPersonPhone")
      .optional()
      .trim()
      .isLength({ min: 10, max: 20 })
      .withMessage("Contact person phone must be between 10 and 20 characters"),

    body("contactPersonEmail")
      .optional()
      .isEmail()
      .withMessage("Valid email address is required"),

    handleValidationErrors,
  ],
  ClientBorrowerAccountController.createClientAccount
);

/**
 * Get client accounts with search functionality
 * GET /api/organizations/:organizationId/client-borrower-accounts
 * 
 * Supports search by borrower name, loanId, or account number
 * Used for dropdown auto-complete
 */
router.get(
  "/",
  [
    query("search")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),

    handleValidationErrors,
  ],
  ClientBorrowerAccountController.getClientAccounts
);

/**
 * Get client account by identifier (accountNumber or loanId)
 * GET /api/organizations/:organizationId/client-borrower-accounts/:identifier
 * 
 * Used for auto-fill in Step 2 form
 */
router.get(
  "/:identifier",
  [
    param("identifier")
      .trim()
      .notEmpty()
      .withMessage("Account number or loan ID is required"),

    handleValidationErrors,
  ],
  ClientBorrowerAccountController.getClientAccountByIdentifier
);

export default router;