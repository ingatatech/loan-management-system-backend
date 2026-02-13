// @ts-nocheck
import { Router } from "express";
import { body, param, query } from "express-validator";
import RepaymentTransactionController from "../controllers/repaymentTransactionController";
import RepaymentScheduleController from "../controllers/repaymentScheduleController";
import LoanClassificationController from "../controllers/loanClassificationController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { PaymentMethod } from "../entities/RepaymentTransaction";
import { LoanClass } from "../entities/LoanClassification";

const router = Router({ mergeParams: true });

// Apply middleware
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

router.post(
  "/:loanId/transactions",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("amountPaid")
      .isFloat({ min: 1 })
      .withMessage("Payment amount must be greater than 0"),

    body("paymentDate")
      .isISO8601()
      .withMessage("Payment date must be a valid date"),

    body("paymentMethod")
      .isIn(Object.values(PaymentMethod))
      .withMessage(`Payment method must be one of: ${Object.values(PaymentMethod).join(", ")}`),

    body("receivedBy")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Received by must be between 2 and 100 characters"),

    body("approvedBy")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Approved by must be between 2 and 100 characters"),

    body("repaymentProof")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Repayment proof must not exceed 500 characters"),

    body("notes")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Notes must not exceed 1000 characters"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.processPayment
);

router.get(
  "/:loanId/transactions",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

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
  RepaymentTransactionController.getLoanTransactions
);

// Get transaction by ID
router.get(
  "/transactions/:transactionId",
  [
    param("transactionId")
      .isInt({ min: 1 })
      .withMessage("Transaction ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.getTransactionById
);

// Reverse a transaction
router.post(
  "/transactions/:transactionId/reverse",
  [
    param("transactionId")
      .isInt({ min: 1 })
      .withMessage("Transaction ID must be a positive integer"),

    body("reason")
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage("Reason must be between 5 and 500 characters"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.reverseTransaction
);

// Generate payment receipt
router.get(
  "/transactions/:transactionId/receipt",
  [
    param("transactionId")
      .isInt({ min: 1 })
      .withMessage("Transaction ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.generatePaymentReceipt
);

// Calculate accrued interest for a loan
router.get(
  "/:loanId/accrued-interest",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    query("asOfDate")
      .optional()
      .isISO8601()
      .withMessage("As of date must be a valid date"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.calculateAccruedInterest
);

// Calculate penalties for a loan
router.get(
  "/:loanId/penalties",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.calculatePenalties
);

// Get payment summary for a loan
router.get(
  "/:loanId/payment-summary",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.getPaymentSummary
);

// =============================================================================
// REPAYMENT SCHEDULE ROUTES
// =============================================================================

// Get loan repayment schedule
router.get(
  "/:loanId/schedule",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

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
  RepaymentScheduleController.getLoanRepaymentSchedule
);

// Update schedule after payment
router.post(
  "/:loanId/schedule/update-after-payment",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("transactionId")
      .isInt({ min: 1 })
      .withMessage("Transaction ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.updateScheduleAfterPayment
);

// Recalculate schedule after payment
router.post(
  "/:loanId/schedule/recalculate",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("recalculationType")
      .optional()
      .isIn(['REDUCE_INSTALLMENT', 'REDUCE_TERM'])
      .withMessage("Recalculation type must be 'REDUCE_INSTALLMENT' or 'REDUCE_TERM'"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.recalculateScheduleAfterPayment
);

// Adjust future installments
router.post(
  "/:loanId/schedule/adjust-future",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("adjustmentType")
      .isIn(['PROPORTIONAL', 'EQUAL_DISTRIBUTION'])
      .withMessage("Adjustment type must be 'PROPORTIONAL' or 'EQUAL_DISTRIBUTION'"),

    body("adjustmentAmount")
      .isFloat({ min: 0.01 })
      .withMessage("Adjustment amount must be greater than 0"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.adjustFutureInstallments
);

// Handle partial payments
router.get(
  "/:loanId/schedule/partial-payments",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.handlePartialPayments
);

// Generate remaining schedule
router.post(
  "/:loanId/schedule/generate-remaining",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("fromDate")
      .optional()
      .isISO8601()
      .withMessage("From date must be a valid date"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.generateRemainingSchedule
);

// Calculate due amounts
router.get(
  "/:loanId/schedule/due-amounts",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    query("asOfDate")
      .optional()
      .isISO8601()
      .withMessage("As of date must be a valid date"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.calculateDueAmounts
);

// Get overdue installments
router.get(
  "/:loanId/schedule/overdue",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.getOverdueInstallments
);

// Update days in arrears
router.post(
  "/:loanId/schedule/update-arrears",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.updateDaysInArrears
);

// Get next payment due date
router.get(
  "/:loanId/schedule/next-due-date",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.getNextPaymentDueDate
);

// Scheduled interest accrual (for cron job or manual trigger)
router.post(
  "/scheduled-interest-accrual",
  RepaymentScheduleController.scheduledInterestAccrual
);

// Update schedule status
router.post(
  "/:loanId/schedule/update-status",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentScheduleController.updateScheduleStatus
);

// =============================================================================
// LOAN CLASSIFICATION ROUTES
// =============================================================================

// Calculate days in arrears for a loan
router.get(
  "/:loanId/classification/days-in-arrears",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanClassificationController.calculateDaysInArrears
);

// Update loan status based on arrears
router.post(
  "/:loanId/classification/update-status",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanClassificationController.updateLoanStatus
);

// Get current outstanding principal
router.get(
  "/:loanId/classification/outstanding-principal",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanClassificationController.getCurrentOutstandingPrincipal
);

router.get(
  "/classification/class/:loanClass/detailed-report",
  [
    param("loanClass").isIn(Object.values(LoanClass)),
    query("startDate").optional().isISO8601(),
    query("endDate").optional().isISO8601(),
    handleValidationErrors
  ],
  LoanClassificationController.getClassificationDetailedReport
);
// Get current accrued interest
router.get(
  "/:loanId/classification/accrued-interest",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanClassificationController.getCurrentAccruedInterest
);
router.get(
  "/classification/comprehensive-report",
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid ISO 8601 date"),
    
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid ISO 8601 date"),
    
    query("includeMovements")
      .optional()
      .isBoolean()
      .withMessage("includeMovements must be a boolean value"),
    
    query("includeInsights")
      .optional()
      .isBoolean()
      .withMessage("includeInsights must be a boolean value"),
    
    handleValidationErrors
  ],
  LoanClassificationController.getComprehensiveClassificationReport
);
router.get(
  "/classification/par-report",
  [
    query("asOfDate")
      .optional()
      .isISO8601()
      .withMessage("As of date must be a valid date"),
    handleValidationErrors,
  ],
  LoanClassificationController.getPortfolioAtRiskReport
);

// Calculate net exposure
router.get(
  "/:loanId/classification/net-exposure",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanClassificationController.calculateNetExposure
);

// Calculate provision required
router.get(
  "/:loanId/classification/provision-required",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanClassificationController.calculateProvisionRequired
);

// Calculate provisions (comprehensive calculation)
router.get(
  "/:loanId/classification/provisions",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  LoanClassificationController.calculateProvisions
);

// Create loan classification record
router.post(
  "/:loanId/classification",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    body("classificationDate")
      .optional()
      .isISO8601()
      .withMessage("Classification date must be a valid date"),

    handleValidationErrors,
  ],
  LoanClassificationController.createLoanClassification
);

// Generate provisioning report for organization
router.get(
  "/classification/provisioning-report",
  [
    query("asOfDate")
      .optional()
      .isISO8601()
      .withMessage("As of date must be a valid date"),

    handleValidationErrors,
  ],
  LoanClassificationController.generateProvisioningReport
);

router.get(
  "/classification",
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
  LoanClassificationController.getLoanClassifications
);
// Bulk update loan classifications for organization
router.post(
  "/classification/bulk-update",
  LoanClassificationController.bulkUpdateLoanClassifications
);

// Get loan classification history
router.get(
  "/:loanId/classification/history",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

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
  LoanClassificationController.getLoanClassificationHistory
);

// Get loans by classification
router.get(
  "/classification/loans/:loanClass",
  [
    param("loanClass")
      .isIn(Object.values(LoanClass))
      .withMessage(`Loan class must be one of: ${Object.values(LoanClass).join(", ")}`),

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
  LoanClassificationController.getLoansByClassification
);


router.post(
  "/delayed-days/daily-update",
  RepaymentTransactionController.performDailyDelayedDaysUpdate
);

router.get(
  "/delayed-days/report",
  [
    query("daysThreshold")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Days threshold must be a non-negative integer"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.getDelayedDaysReport
);

router.get(
  "/:loanId/payment-summary",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Loan ID must be a positive integer"),

    handleValidationErrors,
  ],
  RepaymentTransactionController.getPaymentSummary
);

router.get(
  "/classification/trends",
  [
    query("period")
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage("Period must be between 1 and 365 days"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid date"),
    handleValidationErrors,
  ],
  LoanClassificationController.getClassificationTrends
);

router.get(
  "/classification/provision-gaps",
  [
    query("threshold")
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage("Threshold must be between 0 and 1"),
    handleValidationErrors,
  ],
  LoanClassificationController.getProvisionGaps
);

router.get(
  "/classification/snapshots",
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid date"),
    handleValidationErrors,
  ],
  LoanClassificationController.getDailySnapshots
);

// ============================================================================
// ADD TO: routes/loanManagementRoutes.ts
// ============================================================================

// Daily snapshots route
router.get(
  "/classification/snapshots",
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid date"),
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
  LoanClassificationController.getDailySnapshots
);

// PAR Trends route
router.get(
  "/classification/par-trends",
  [
    query("startDate")
      .isISO8601()
      .withMessage("Start date must be a valid date"),
    query("endDate")
      .isISO8601()
      .withMessage("End date must be a valid date"),
    handleValidationErrors,
  ],
  LoanClassificationController.getPARReportWithTrends
);

// PAR by Loan Officer route
router.get(
  "/classification/par-by-officer",
  [
    query("asOfDate")
      .optional()
      .isISO8601()
      .withMessage("As of date must be a valid date"),
    handleValidationErrors,
  ],
  LoanClassificationController.getPARByLoanOfficer
);

// PAR by Branch route
router.get(
  "/classification/par-by-branch",
  [
    query("asOfDate")
      .optional()
      .isISO8601()
      .withMessage("As of date must be a valid date"),
    handleValidationErrors,
  ],
  LoanClassificationController.getPARByBranch
);

export default router;