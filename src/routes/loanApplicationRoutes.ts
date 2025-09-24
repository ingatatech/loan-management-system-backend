
// @ts-nocheck
import { Router } from "express";
import { body, param, query } from "express-validator";
import LoanApplicationController from "../controllers/loanApplicationController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import {  handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { uploadFields, handleMulterError } from "../helpers/multer";
import { Gender, MaritalStatus, RelationshipType } from "../entities/BorrowerProfile";
import { LoanStatus, InterestMethod, RepaymentFrequency, IncomeFrequency, BusinessType, EconomicSector, BorrowerType, InstitutionType } from "../entities/Loan";

import { ReviewDecision } from "../entities/LoanReview";
import { WorkflowStep } from "../entities/LoanWorkflow";
import { CollateralType } from "../entities/LoanCollateral";
const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

router.post(
  "/:loanId/reviews",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    body("reviewMessage")
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage("Review message must be between 10 and 2000 characters"),

    handleValidationErrors,
  ],
  LoanApplicationController.addLoanReview
);


router.get(
  "/:loanId/guarantors",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoanGuarantors
);


router.put(
  "/guarantors/:guarantorId",
  [
    param("guarantorId")
      .isInt({ min: 1 })
      .withMessage("Guarantor ID must be a positive integer"),
    
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters"),
    
    body("phone")
      .optional()
      .trim()
      .isLength({ min: 10, max: 20 })
      .withMessage("Phone must be between 10 and 20 characters"),
    
    body("guaranteedAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Guaranteed amount must be a positive number"),

    handleValidationErrors,
  ],
  LoanApplicationController.updateGuarantor
);


router.get(
  "/:loanId/reviews",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoanReviews
);


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
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    query("status")
      .optional()
      .isIn(Object.values(LoanStatus))
      .withMessage(`Status must be one of: ${Object.values(LoanStatus).join(", ")}`),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoanApplications
);
// ============================================================================
// ✅ NEW: Approve Loan Application
// ============================================================================


router.post(
  "/",
  uploadFields,
  handleMulterError,
  [
    
    body("address")
      .custom((value) => {
        let addressObj = value;
        if (typeof value === 'string') {
          try { 
            addressObj = JSON.parse(value); 
          } catch (e) { 
            throw new Error('Address must be valid JSON'); 
          }
        }
        if (typeof addressObj !== 'object') {
          throw new Error('Address must be an object');
        }
        return true;
      }),

    // ✅ ENHANCED: Loan validation with new fields
    body("purposeOfLoan")
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Purpose of loan must be between 5 and 500 characters"),
    
    body("branchName")
      .trim()
      .notEmpty()
      .withMessage("Branch name is required"),
    
    // ✅ REPLACED: loanOfficer with businessOfficer
    body("businessOfficer")
      .trim()
      .notEmpty()
      .withMessage("Business officer is required"),
    
    body("disbursedAmount")
      .isFloat({ min: 1000 })
      .withMessage("Loan amount must be at least 1,000 RWF"),

    // ✅ NEW: Income source validation with "Other" support
    body("incomeSource")
      .optional()
      .isString()
      .withMessage("Income source must be a string"),
    
    body("otherIncomeSource")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Other income source must be less than 200 characters")
      .custom((value, { req }) => {
        // If incomeSource is "other", otherIncomeSource is required
        if (req.body.incomeSource === "other" && (!value || value.trim() === "")) {
          throw new Error("Please specify the income source when 'Other' is selected");
        }
        return true;
      }),
    
    // ✅ NEW: Income frequency validation
    body("incomeFrequency")
      .optional()
      .isIn(Object.values(IncomeFrequency))
      .withMessage(`Income frequency must be one of: ${Object.values(IncomeFrequency).join(", ")}`),
    
    // ✅ NEW: Income amount validation
    body("incomeAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Income amount must be a positive number"),

    // Business type and economic sector (optional)
    body("businessType")
      .optional()
      .isIn(Object.values(BusinessType))
      .withMessage("Invalid business type"),
    
    body("economicSector")
      .optional()
      .isIn(Object.values(EconomicSector))
      .withMessage("Invalid economic sector"),
    
    // Collateral validation
    body("collateralType")
      .optional()
      .isIn(Object.values(CollateralType))
      .withMessage("Invalid collateral type"),
    
    body("collateralValue")
      .optional()
      .isFloat({ min: 0, max: 9999999999999.99 })
      .withMessage("Collateral value must be between 0 and 9,999,999,999,999.99"),
    
    // Guarantor validation
    body("guarantorName")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Guarantor name must be less than 100 characters"),
    
    body("guarantorPhone")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Guarantor phone must be less than 20 characters"),

    handleValidationErrors,
  ],
  LoanApplicationController.createLoanApplication
);


// ============================================================================
// ✅ NEW: Reject Loan Application
// ============================================================================
router.post(
  "/:loanId/reject",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    body("rejectionReason")
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage("Rejection reason must be between 10 and 500 characters"),
    
    body("notes")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Notes must not exceed 1000 characters"),
    
    handleValidationErrors,
  ],
  LoanApplicationController.rejectLoanApplication
);
// ============================================================================
// ✅ NEW: Get Pending Loan Applications
// ============================================================================
// Get rejected loan applications
router.get(
  "/rejected",
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
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    handleValidationErrors,
  ],
  LoanApplicationController.getRejectedLoanApplications
);

// Update the pending route to support statusFilter
router.get(
  "/pending",
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
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    query("statusFilter")
      .optional()
      .isIn(['pending', 'rejected', 'all'])
      .withMessage("Status filter must be 'pending', 'rejected', or 'all'"),

    handleValidationErrors,
  ],
  LoanApplicationController.getPendingLoanApplications
);
router.get(
  "/:loanId/performance-metrics",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    handleValidationErrors,
  ],
  LoanApplicationController.getLoanPerformanceMetrics
);
router.get(
  "/stats",
  LoanApplicationController.getLoanApplicationStats
);

router.post(
  "/accrual/daily",
  LoanApplicationController.performDailyInterestAccrual
);

router.get(
  "/portfolio/summary",
  LoanApplicationController.getPortfolioSummary
);

router.post(
  "/balances/update",
  LoanApplicationController.updateOrganizationLoanBalances
);

router.post(
  "/statuses/bulk-update",
  LoanApplicationController.bulkUpdateLoanStatuses
);

router.get(
  "/overdue",
  [
    query("daysOverdue")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Days overdue must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getOverdueLoans
);

router.get(
  "/classification/report",
  LoanApplicationController.getLoanClassificationReport
);

router.get(
  "/:loanId",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoanApplicationById
);

router.get(
  "/:loanId/balances/current",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoanCurrentBalances
);

router.post(
  "/:loanId/balances/recalculate",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.recalculateLoanBalances
);

router.put(
  "/:loanId",
  uploadFields,
  handleMulterError,
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("firstName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("First name must be between 2 and 100 characters"),

    body("disbursedAmount")
      .optional()
      .isFloat({ min: 1000, max: 1000000000 })
      .withMessage("Disbursed amount must be between 1,000 and 1,000,000,000"),

    body("annualInterestRate")
      .optional()
      .isFloat({ min: 0.1, max: 50 })
      .withMessage("Annual interest rate must be between 0.1% and 50%"),

    body("termInMonths")
      .optional()
      .isInt({ min: 1, max: 120 })
      .withMessage("Term in months must be between 1 and 120 months"),

    handleValidationErrors,
  ],
  LoanApplicationController.updateLoanApplication
);

router.delete(
  "/:loanId",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.deleteLoanApplication
);

router.post(
  "/:loanId/status/change",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("newStatus")
      .isIn(Object.values(LoanStatus))
      .withMessage(`New status must be one of: ${Object.values(LoanStatus).join(", ")}`),

    body("notes")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Notes must not exceed 1000 characters"),

    body("sendEmail")
      .optional()
      .isBoolean()
      .withMessage("sendEmail must be a boolean value"),

    body("customMessage")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Custom message must not exceed 500 characters"),

    body("dueDate")
      .optional()
      .isISO8601()
      .withMessage("Due date must be a valid ISO date"),

    handleValidationErrors,
  ],
  LoanApplicationController.changeLoanStatus
);

/**
 * Bulk change loan status
 * POST /api/organizations/:organizationId/loan-applications/status/bulk-change
 */
router.post(
  "/status/bulk-change",
  [
    body("loanIds")
      .isArray({ min: 1, max: 50 })
      .withMessage("loanIds must be an array with 1-50 loan IDs"),

    body("loanIds.*")
      .isInt({ min: 1 })
      .withMessage("Each loan ID must be a positive integer"),

    body("newStatus")
      .isIn(Object.values(LoanStatus))
      .withMessage(`New status must be one of: ${Object.values(LoanStatus).join(", ")}`),

    body("notes")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Notes must not exceed 1000 characters"),

    body("sendEmail")
      .optional()
      .isBoolean()
      .withMessage("sendEmail must be a boolean value"),

    body("customMessage")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Custom message must not exceed 500 characters"),

    handleValidationErrors,
  ],
  LoanApplicationController.bulkChangeLoanStatus
);

/**
 * Get loans eligible for status change
 * GET /api/organizations/:organizationId/loan-applications/eligible-for-status-change
 */
router.get(
  "/eligible-for-status-change",
  [
    query("currentStatus")
      .optional()
      .isIn(Object.values(LoanStatus))
      .withMessage(`Current status must be one of: ${Object.values(LoanStatus).join(", ")}`),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoansEligibleForStatusChange
);

/**
 * Get valid status transitions for a specific loan
 * GET /api/organizations/:organizationId/loan-applications/:loanId/status/transitions
 */
router.get(
  "/:loanId/status/transitions",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getValidStatusTransitions
);

/**
 * Get loan status change history
 * GET /api/organizations/:organizationId/loan-applications/:loanId/status/history
 */
router.get(
  "/:loanId/status/history",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoanStatusHistory
);

// Export the updated router (this should be at the end of your routes file)


// Add these routes to your existing loanApplicationRoutes.ts
// Place them BEFORE the /:loanId route to avoid conflicts


// ============================================================================
// WORKFLOW ROUTES - Add these to your existing router
// ============================================================================

/**
 * Get my assigned loans (for loan officers, managers, etc.)
 * GET /api/organizations/:organizationId/loan-applications/my-assigned-loans
 */
router.get(
  "/my-assigned-loans",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),

    query("status")
      .optional()
      .isIn(['pending', 'in_progress', 'completed', 'rejected'])
      .withMessage("Invalid status filter"),

  ],
  LoanApplicationController.getMyAssignedLoans
);

/**
 * Get workflow for specific loan
 * GET /api/organizations/:organizationId/loan-applications/:loanId/workflow
 */
router.get(
  "/:loanId/workflow",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getWorkflowForLoan
);

/**
 * Get workflow history for loan
 * GET /api/organizations/:organizationId/loan-applications/:loanId/workflow/history
 */
router.get(
  "/:loanId/workflow/history",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getWorkflowHistory
);

/**
 * Get available reviewers for next step
 * GET /api/organizations/:organizationId/loan-applications/:loanId/workflow/available-reviewers
 */
router.get(
  "/:loanId/workflow/available-reviewers",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getAvailableReviewers
);

/**
 * Forward loan to specific reviewer
 * POST /api/organizations/:organizationId/loan-applications/:loanId/workflow/forward
 */
router.post(
  "/:loanId/workflow/forward",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    body("toUserId")
      .isInt({ min: 1 })
      .withMessage("To user ID must be a positive integer"),
    
    body("message")
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage("Message must be between 10 and 1000 characters"),
    
    handleValidationErrors,
  ],
  LoanApplicationController.forwardLoanToReviewer
);

/**
 * Reassign loan to different reviewer at same step
 * POST /api/organizations/:organizationId/loan-applications/:loanId/workflow/reassign
 */
router.post(
  "/:loanId/workflow/reassign",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    body("fromUserId")
      .isInt({ min: 1 })
      .withMessage("From user ID must be a positive integer"),
    
    body("toUserId")
      .isInt({ min: 1 })
      .withMessage("To user ID must be a positive integer"),
    
    body("reason")
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage("Reason must be between 10 and 500 characters"),
    
    handleValidationErrors,
  ],
  LoanApplicationController.reassignLoan
);

/**
 * ✅ ENHANCED: Add loan review with workflow integration
 * POST /api/organizations/:organizationId/loan-applications/:loanId/reviews
 */
router.post(
  "/:loanId/reviews",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    body("reviewMessage")
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage("Review message must be between 10 and 2000 characters"),

    // ✅ NEW: Decision validation
    body("decision")
      .optional()
      .isIn(Object.values(ReviewDecision))
      .withMessage(`Decision must be one of: ${Object.values(ReviewDecision).join(", ")}`),

    // ✅ NEW: Next reviewer validation (required if decision is FORWARD)
    body("nextReviewerId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Next reviewer ID must be a positive integer"),

    // ✅ Custom validation: If decision is FORWARD, nextReviewerId is required
    body("nextReviewerId")
      .if(body("decision").equals(ReviewDecision.FORWARD))
      .notEmpty()
      .withMessage("Next reviewer ID is required when forwarding"),

    handleValidationErrors,
  ],
  LoanApplicationController.addLoanReview
);
router.post(
  "/:loanId/start-review",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),
    
    body("reviewerId")
      .isInt({ min: 1 })
      .withMessage("Reviewer ID must be a positive integer"),
    
    body("reviewerRole")
      .isIn([WorkflowStep.BOARD_DIRECTOR, WorkflowStep.SENIOR_MANAGER, WorkflowStep.MANAGING_DIRECTOR])
      .withMessage("Invalid reviewer role"),
    
    body("reviewMessage")
      .optional()
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage("Review message must be between 10 and 2000 characters"),

    handleValidationErrors,
  ],
  LoanApplicationController.startLoanReview
);

/**
 * Get unassigned pending loans (STAFF only)
 * GET /api/organizations/:organizationId/loan-applications/unassigned-pending
 */
router.get(
  "/unassigned-pending",
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
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    handleValidationErrors,
  ],
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Route to the enhanced getPendingLoanApplications method
    LoanApplicationController.getPendingLoanApplications(req, res, next);
  }
);


router.get(
  "/guarantors/needs-extension",
  [
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
  LoanApplicationController.getGuarantorsNeedingExtension
);

/**
 * Bulk extend multiple guarantors
 * POST /api/organizations/:organizationId/loan-applications/guarantors/bulk-extend
 */
router.post(
  "/guarantors/bulk-extend",
  [
    body("guarantorUpdates")
      .isArray({ min: 1 })
      .withMessage("guarantorUpdates must be a non-empty array"),
    
    body("guarantorUpdates.*.guarantorId")
      .isInt({ min: 1 })
      .withMessage("Each guarantorId must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.bulkExtendGuarantors
);

/**
 * Get extended guarantors for a loan
 * GET /api/organizations/:organizationId/loan-applications/:loanId/guarantors/extended
 */
router.get(
  "/:loanId/guarantors/extended",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.getLoanGuarantorsExtended
);

/**
 * Extend a guarantor
 * PUT /api/organizations/:organizationId/loan-applications/guarantors/:guarantorId/extend
 */
router.put(
  "/guarantors/:guarantorId/extend",
  [
    param("guarantorId")
      .isInt({ min: 1 })
      .withMessage("Guarantor ID must be a positive integer"),
    
    // Basic Information
    body("accountNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Account number must not exceed 50 characters"),
    
    body("guarantorType")
      .optional()
      .isIn(['individual', 'institution'])
      .withMessage("Guarantor type must be 'individual' or 'institution'"),
    
    // Individual fields
    body("surname")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Surname must not exceed 100 characters"),
    
    body("forename1")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Forename 1 must not exceed 50 characters"),
    
    body("forename2")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Forename 2 must not exceed 50 characters"),
    
    body("forename3")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Forename 3 must not exceed 50 characters"),
    

    

    
    body("placeOfBirth")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Place of birth must not exceed 100 characters"),
    
    // Institution fields
    body("institutionName")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Institution name must not exceed 100 characters"),
    
    body("tradingName")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Trading name must not exceed 100 characters"),
    
    body("companyRegNo")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Company reg number must not exceed 50 characters"),
    
    body("companyRegistrationDate")
      .optional()
      .isISO8601()
      .withMessage("Company registration date must be a valid ISO date"),
    
    // Common fields
    body("passportNo")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Passport number must not exceed 50 characters"),
    
    body("nationality")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Nationality must not exceed 50 characters"),
    
    // Postal Address
    body("postalAddressLine1")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Postal address line 1 must not exceed 200 characters"),
    
    body("postalAddressLine2")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Postal address line 2 must not exceed 200 characters"),
    
    body("town")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Town must not exceed 100 characters"),
    
    body("postalCode")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Postal code must not exceed 20 characters"),
    
    body("country")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Country must not exceed 100 characters"),
    
    // Contact Information
    body("workTelephone")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Work telephone must not exceed 20 characters"),
    
    body("homeTelephone")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Home telephone must not exceed 20 characters"),
    
    body("mobileTelephone")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Mobile telephone must not exceed 20 characters"),
    
    // Extended Collateral
    body("collateralAccountNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Collateral account number must not exceed 50 characters"),
    
    body("extendedCollateralType")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Extended collateral type must not exceed 100 characters"),
    
    body("extendedCollateralValue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Extended collateral value must be a positive number"),
    
    body("collateralLastValuationDate")
      .optional()
      .isISO8601()
      .withMessage("Collateral last valuation date must be a valid ISO date"),
    
    body("collateralExpiryDate")
      .optional()
      .isISO8601()
      .withMessage("Collateral expiry date must be a valid ISO date"),
    
    // Bounced Cheque fields validation (optional - add only if needed)
    body("chequeNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Cheque number must not exceed 50 characters"),
    
    body("chequeAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Cheque amount must be a positive number"),

    handleValidationErrors,
  ],
  LoanApplicationController.extendGuarantor
);



// Add these routes to your loanApplicationRoutes.ts

/**
 * Get existing guarantor data from collaterals for migration
 * GET /api/organizations/:organizationId/loan-applications/guarantors/existing-data
 */
router.get(
  "/guarantors/existing-data",
  [
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
  LoanApplicationController.getExistingGuarantorData
);

/**
 * Check migration status for specific collaterals
 * POST /api/organizations/:organizationId/loan-applications/guarantors/check-migration
 */
router.post(
  "/guarantors/check-migration",
  [
    body("collateralIds")
      .isArray({ min: 1 })
      .withMessage("collateralIds must be a non-empty array"),
    
    body("collateralIds.*")
      .isInt({ min: 1 })
      .withMessage("Each collateral ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.checkGuarantorMigrationStatus
);

/**
 * Bulk migrate guarantors from collaterals
 * POST /api/organizations/:organizationId/loan-applications/guarantors/bulk-migrate
 */
router.post(
  "/guarantors/bulk-migrate",
  [
    body("migrationData")
      .isArray({ min: 1 })
      .withMessage("migrationData must be a non-empty array"),
    
    body("migrationData.*.collateralId")
      .isInt({ min: 1 })
      .withMessage("Each collateralId must be a positive integer"),
    
    body("migrationData.*.loanId")
      .isInt({ min: 1 })
      .withMessage("Each loanId must be a positive integer"),
    
    body("migrationData.*.borrowerId")
      .isInt({ min: 1 })
      .withMessage("Each borrowerId must be a positive integer"),
    
    body("migrationData.*.organizationId")
      .isInt({ min: 1 })
      .withMessage("Each organizationId must be a positive integer"),

    handleValidationErrors,
  ],
  LoanApplicationController.bulkMigrateGuarantors
);

/**
 * Quick migrate all guarantors at once
 * POST /api/organizations/:organizationId/loan-applications/guarantors/quick-migrate-all
 */
router.post(
  "/guarantors/quick-migrate-all",
  LoanApplicationController.quickMigrateAllGuarantors
);


router.get(
  "/collaterals/all",
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
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    handleValidationErrors,
  ],
  LoanApplicationController.getAllCollaterals
);


router.put(
  "/collaterals/:collateralId/extend",
  [
    param("collateralId")
      .isInt({ min: 1 })
      .withMessage("Collateral ID must be a positive integer"),
    
    body("accountNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Account number must not exceed 50 characters"),
    
    body("collateralType")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Collateral type must not exceed 100 characters"),
    
    body("collateralValue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Collateral value must be a positive number"),
    
    body("collateralLastValuationDate")
      .optional()
      .isISO8601()
      .withMessage("Last valuation date must be a valid ISO date"),
    
    body("collateralExpiryDate")
      .optional()
      .isISO8601()
      .withMessage("Expiry date must be a valid ISO date"),

    handleValidationErrors,
  ],
  LoanApplicationController.extendCollateral
);

export default router;