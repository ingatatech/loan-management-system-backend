import { Router } from "express";
import { body, param, query } from "express-validator";
import LoanAnalysisReportController from "../controllers/loanAnalysisReportController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { ReportType, ReportStatus } from "../entities/LoanAnalysisReport";
import { uploadFields } from "../helpers/multer";

const router = Router({ mergeParams: true });



// Apply middleware
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

// ========================================
// GET REPORT STATISTICS
// ========================================
router.get(
  "/statistics",
  LoanAnalysisReportController.getReportStatistics
);

// ========================================
// CREATE LOAN ANALYSIS REPORT WITH SIGNATURES
// ========================================
router.post(
  "/",
  uploadFields, // ✅ NEW: Add multer middleware to handle file uploads
  [
    body("loanId")
      .isInt({ min: 1 })
      .withMessage("Valid loan ID is required"),

    body("reportType")
      .isIn(Object.values(ReportType))
      .withMessage("Report type must be either 'approve' or 'reject'"),

    body("introductionMessage")
      .trim()
      .notEmpty()
      .withMessage("Introduction message is required")
      .isLength({ min: 20, max: 10000 })
      .withMessage("Introduction message must be between 20 and 10000 characters"),

    // ✅ NEW: Optional signature name fields
    body("loanOfficerName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage("Loan officer name must be between 2 and 200 characters"),

    body("managingDirectorName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage("Managing director name must be between 2 and 200 characters"),

    // Approval validation
    body("approveMessage")
      .if(body("reportType").equals(ReportType.APPROVE))
      .trim()
      .notEmpty()
      .withMessage("Approve message is required for approval reports")
      .isLength({ min: 20, max: 10000 })
      .withMessage("Approve message must be between 20 and 10000 characters"),

    body("approvalConditions")
      .if(body("reportType").equals(ReportType.APPROVE))
      .custom((value) => {
        if (!value) {
          throw new Error("Approval conditions are required for approval reports");
        }
        const conditions = typeof value === 'string' ? JSON.parse(value) : value;
        
        if (!conditions.approvedAmount || conditions.approvedAmount <= 0) {
          throw new Error("Valid approved amount is required");
        }
        if (!conditions.repaymentPeriod || conditions.repaymentPeriod <= 0) {
          throw new Error("Valid repayment period is required");
        }
        if (!conditions.paymentModality) {
          throw new Error("Payment modality is required");
        }
        if (conditions.interestRate === undefined || conditions.interestRate < 0) {
          throw new Error("Valid interest rate is required (can be 0)");
        }
        return true;
      }),

    // Rejection validation
    body("rejectMessage")
      .if(body("reportType").equals(ReportType.REJECT))
      .trim()
      .notEmpty()
      .withMessage("Reject message is required for rejection reports")
      .isLength({ min: 20, max: 10000 })
      .withMessage("Reject message must be between 20 and 10000 characters"),

    body("rejectionReasons")
      .if(body("reportType").equals(ReportType.REJECT))
      .custom((value) => {
        if (!value) {
          throw new Error("Rejection reasons are required for rejection reports");
        }
        const reasons = typeof value === 'string' ? JSON.parse(value) : value;
        
        if (!reasons.primaryReason) {
          throw new Error("Primary reason is required");
        }
        if (!reasons.detailedReasons || !Array.isArray(reasons.detailedReasons) || reasons.detailedReasons.length === 0) {
          throw new Error("At least one detailed reason is required");
        }
        return true;
      }),

    body("additionalNotes")
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage("Additional notes must not exceed 5000 characters"),

    body("internalRemarks")
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage("Internal remarks must not exceed 5000 characters"),

    handleValidationErrors,
  ],
  LoanAnalysisReportController.createAnalysisReport
);

// ✅ REMOVED: Sign report endpoint - signatures now uploaded during creation
// The following endpoint has been removed:
// router.post("/:reportId/sign", ...)

// ========================================
// GET REPORTS FOR A SPECIFIC LOAN
// ========================================
router.get(
  "/loan/:loanId",
  [
    param("loanId")
      .isInt({ min: 1 })
      .withMessage("Valid loan ID is required"),

    handleValidationErrors,
  ],
  LoanAnalysisReportController.getLoanReports
);

// ========================================
// GET REPORT BY ID
// ========================================
router.get(
  "/:reportId",
  [
    param("reportId")
      .isInt({ min: 1 })
      .withMessage("Valid report ID is required"),

    handleValidationErrors,
  ],
  LoanAnalysisReportController.getReportById
);

// ========================================
// GET ALL REPORTS WITH PAGINATION
// ========================================
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

    query("reportType")
      .optional()
      .isIn(Object.values(ReportType))
      .withMessage("Report type must be either 'approve' or 'reject'"),

    query("status")
      .optional()
      .isIn(Object.values(ReportStatus))
      .withMessage("Invalid status value"),

    query("isFinalized")
      .optional()
      .isBoolean()
      .withMessage("isFinalized must be a boolean"),

    query("search")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    handleValidationErrors,
  ],
  LoanAnalysisReportController.getAllReports
);

// ========================================
// UPDATE REPORT
// ========================================
router.put(
  "/:reportId",
  [
    param("reportId")
      .isInt({ min: 1 })
      .withMessage("Valid report ID is required"),

    body("introductionMessage")
      .optional()
      .trim()
      .isLength({ min: 20, max: 10000 })
      .withMessage("Introduction message must be between 20 and 10000 characters"),

    body("approveMessage")
      .optional()
      .trim()
      .isLength({ min: 20, max: 10000 })
      .withMessage("Approve message must be between 20 and 10000 characters"),

    body("rejectMessage")
      .optional()
      .trim()
      .isLength({ min: 20, max: 10000 })
      .withMessage("Reject message must be between 20 and 10000 characters"),

    body("additionalNotes")
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage("Additional notes must not exceed 5000 characters"),

    body("internalRemarks")
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage("Internal remarks must not exceed 5000 characters"),

    handleValidationErrors,
  ],
  LoanAnalysisReportController.updateReport
);

// ========================================
// DELETE REPORT (SOFT DELETE)
// ========================================
router.delete(
  "/:reportId",
  [
    param("reportId")
      .isInt({ min: 1 })
      .withMessage("Valid report ID is required"),

    handleValidationErrors,
  ],
  LoanAnalysisReportController.deleteReport
);

export default router;