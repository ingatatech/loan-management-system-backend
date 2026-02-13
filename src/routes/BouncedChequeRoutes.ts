import { Router } from "express";
import { body, param, query } from "express-validator";
import BouncedChequeController from "../controllers/BouncedChequeController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { BouncedChequeType, ChequeReturnReason } from "../entities/BouncedCheque";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

/**
 * @route   POST /api/organizations/:organizationId/bounced-cheques
 * @desc    Create a new bounced cheque record
 * @access  Private
 */
router.post(
  "/",
  BouncedChequeController.createBouncedCheque
);

/**
 * @route   GET /api/organizations/:organizationId/bounced-cheques
 * @desc    Get all bounced cheques with pagination and filters
 * @access  Private
 */
router.get(
  "/",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    

    query("search")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Search term must be max 100 characters"),
    
    query("type")
      .optional()
      .isIn(Object.values(BouncedChequeType))
      .withMessage(`Type must be one of: ${Object.values(BouncedChequeType).join(", ")}`),
    
    query("reason")
      .optional()
      .isIn(Object.values(ChequeReturnReason))
      .withMessage(`Reason must be one of: ${Object.values(ChequeReturnReason).join(", ")}`),

    handleValidationErrors,
  ],
  BouncedChequeController.getAllBouncedCheques
);

/**
 * @route   GET /api/organizations/:organizationId/bounced-cheques/stats
 * @desc    Get bounced cheque statistics
 * @access  Private
 */
router.get(
  "/stats",
  BouncedChequeController.getBouncedChequeStats
);

/**
 * @route   GET /api/organizations/:organizationId/bounced-cheques/:chequeId
 * @desc    Get a single bounced cheque by ID
 * @access  Private
 */
router.get(
  "/:chequeId",
  [
    param("chequeId")
      .isInt({ min: 1 })
      .withMessage("Cheque ID must be a positive integer"),

    handleValidationErrors,
  ],
  BouncedChequeController.getBouncedChequeById
);

/**
 * @route   PUT /api/organizations/:organizationId/bounced-cheques/:chequeId
 * @desc    Update a bounced cheque
 * @access  Private
 */
router.put(
  "/:chequeId",
  [
    param("chequeId")
      .isInt({ min: 1 })
      .withMessage("Cheque ID must be a positive integer"),
    
    body("accountNumber")
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage("Account number must be max 50 characters"),
    
    body("type")
      .optional()
      .isIn(Object.values(BouncedChequeType))
      .withMessage(`Type must be one of: ${Object.values(BouncedChequeType).join(", ")}`),
    
    body("amount")
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage("Amount must be a positive number"),
    
    body("returnedChequeReason")
      .optional()
      .isIn(Object.values(ChequeReturnReason))
      .withMessage(`Returned cheque reason must be one of: ${Object.values(ChequeReturnReason).join(", ")}`),

    handleValidationErrors,
  ],
  BouncedChequeController.updateBouncedCheque
);

/**
 * @route   DELETE /api/organizations/:organizationId/bounced-cheques/:chequeId
 * @desc    Delete a bounced cheque
 * @access  Private
 */
router.delete(
  "/:chequeId",
  [
    param("chequeId")
      .isInt({ min: 1 })
      .withMessage("Cheque ID must be a positive integer"),

    handleValidationErrors,
  ],
  BouncedChequeController.deleteBouncedCheque
);

/**
 * @route   POST /api/organizations/:organizationId/bounced-cheques/:chequeId/link-loan
 * @desc    Link a bounced cheque to a loan
 * @access  Private
 */
router.post(
  "/:chequeId/link-loan",
  [
    param("chequeId")
      .isInt({ min: 1 })
      .withMessage("Cheque ID must be a positive integer"),
    
    body("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  BouncedChequeController.linkToLoan
);

export default router;