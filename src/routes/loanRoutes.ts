import { Router } from "express";
import { body, param, query } from "express-validator";
import LoanController from "../controllers/loanController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { requirePermission, Permission } from "../middleware/rbac";
import { validateId, validatePagination, handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { InterestMethod, RepaymentFrequency, LoanStatus } from "../entities/Loan";
import { CollateralType } from "../entities/LoanCollateral";

const router = Router({ mergeParams: true });

// Apply authentication and tenant isolation to all routes
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

/**
 * POST /api/organizations/:organizationId/loans
 * Create a new loan
 */
router.post(
  "/",
  [
    body("borrowerId")
      .isInt({ min: 1 })
      .withMessage("Borrower ID must be a positive integer"),
    
    body("purposeOfLoan")
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Purpose of loan must be between 5 and 500 characters"),
    
    body("branchName")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Branch name must be between 2 and 100 characters"),
    
    body("loanOfficer")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Loan officer name must be between 2 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("Loan officer name contains invalid characters"),
    
    body("disbursedAmount")
      .isFloat({ min: 1000, max: 1000000000 })
      .withMessage("Disbursed amount must be between 1,000 and 1,000,000,000"),
    
    body("disbursementDate")
      .isISO8601()
      .withMessage("Disbursement date must be a valid date")
      .custom((value) => {
        const disbursementDate = new Date(value);
        const today = new Date();
        const maxFutureDate = new Date();
        maxFutureDate.setDate(today.getDate() + 30); // Allow up to 30 days in future
        
        if (disbursementDate > maxFutureDate) {
          throw new Error("Disbursement date cannot be more than 30 days in the future");
        }
        
        const minPastDate = new Date();
        minPastDate.setFullYear(today.getFullYear() - 1); // Allow up to 1 year in past
        
        if (disbursementDate < minPastDate) {
          throw new Error("Disbursement date cannot be more than 1 year in the past");
        }
        
        return true;
      }),
    
    body("annualInterestRate")
      .isFloat({ min: 0.1, max: 50 })
      .withMessage("Annual interest rate must be between 0.1% and 50%"),
    
    body("interestMethod")
      .isIn(Object.values(InterestMethod))
      .withMessage(`Interest method must be one of: ${Object.values(InterestMethod).join(", ")}`),
    
    body("termInMonths")
      .isInt({ min: 1, max: 120 })
      .withMessage("Term in months must be between 1 and 120 months"),
    
    body("repaymentFrequency")
      .isIn(Object.values(RepaymentFrequency))
      .withMessage(`Repayment frequency must be one of: ${Object.values(RepaymentFrequency).join(", ")}`),
    
    body("gracePeriodMonths")
      .optional()
      .isInt({ min: 0, max: 12 })
      .withMessage("Grace period must be between 0 and 12 months"),
    
    body("notes")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Notes must not exceed 1000 characters"),
    
    // Collateral validation (optional array)
    body("collaterals")
      .optional()
      .isArray()
      .withMessage("Collaterals must be an array"),
    
    body("collaterals.*.collateralType")
      .optional()
      .isIn(Object.values(CollateralType))
      .withMessage(`Collateral type must be one of: ${Object.values(CollateralType).join(", ")}`),
    
    body("collaterals.*.description")
      .optional()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Collateral description must be between 5 and 500 characters"),
    
    body("collaterals.*.collateralValue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Collateral value must be a positive number"),
    
    body("collaterals.*.guarantorName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Guarantor name must be between 2 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("Guarantor name contains invalid characters"),
    
    body("collaterals.*.guarantorPhone")
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Guarantor phone must be a valid phone number"),
    
    handleValidationErrors,
  ],
  LoanController.createLoan
);

/**
 * GET /api/organizations/:organizationId/loans
 * Get all loans for an organization
 */
router.get(
  "/",
  [
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
      .withMessage("Search query must not exceed 255 characters"),
    
    query("status")
      .optional()
      .isIn(Object.values(LoanStatus))
      .withMessage(`Status must be one of: ${Object.values(LoanStatus).join(", ")}`),
    
    query("borrowerId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Borrower ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  validatePagination,
  LoanController.getLoans
);

/**
 * GET /api/organizations/:organizationId/loans/classification-report
 * Get loan classification and provisioning report
 */
router.get(
  "/classification-report",
  LoanController.getLoanClassificationReport
);

/**
 * GET /api/organizations/:organizationId/loans/:loanId
 * Get a specific loan by ID
 */
router.get(
  "/:loanId",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  LoanController.getLoanById
);

/**
 * PUT /api/organizations/:organizationId/loans/:loanId
 * Update a loan
 */
router.put(
  "/:loanId",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    body("purposeOfLoan")
      .optional()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Purpose of loan must be between 5 and 500 characters"),
    
    body("branchName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Branch name must be between 2 and 100 characters"),
    
    body("loanOfficer")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Loan officer name must be between 2 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("Loan officer name contains invalid characters"),
    
    body("disbursedAmount")
      .optional()
      .isFloat({ min: 1000, max: 1000000000 })
      .withMessage("Disbursed amount must be between 1,000 and 1,000,000,000"),
    
    body("disbursementDate")
      .optional()
      .isISO8601()
      .withMessage("Disbursement date must be a valid date"),
    
    body("annualInterestRate")
      .optional()
      .isFloat({ min: 0.1, max: 50 })
      .withMessage("Annual interest rate must be between 0.1% and 50%"),
    
    body("interestMethod")
      .optional()
      .isIn(Object.values(InterestMethod))
      .withMessage(`Interest method must be one of: ${Object.values(InterestMethod).join(", ")}`),
    
    body("termInMonths")
      .optional()
      .isInt({ min: 1, max: 120 })
      .withMessage("Term in months must be between 1 and 120 months"),
    
    body("repaymentFrequency")
      .optional()
      .isIn(Object.values(RepaymentFrequency))
      .withMessage(`Repayment frequency must be one of: ${Object.values(RepaymentFrequency).join(", ")}`),
    
    body("gracePeriodMonths")
      .optional()
      .isInt({ min: 0, max: 12 })
      .withMessage("Grace period must be between 0 and 12 months"),
    
    body("notes")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Notes must not exceed 1000 characters"),
    
    handleValidationErrors,
  ],
  LoanController.updateLoan
);

/**
 * POST /api/organizations/:organizationId/loans/:loanId/approve
 * Approve a loan
 */
router.post(
  "/:loanId/approve",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  LoanController.approveLoan
);
export default router;