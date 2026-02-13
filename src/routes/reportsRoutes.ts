
import { Router } from "express";
import { body, query, param } from "express-validator";
import ReportsController from "../controllers/reportsController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware } from "../middleware/tenantIsolation";
import { UserRole } from "../entities/User";

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);

// ========================================
// SYSTEM REPORTS
// ========================================

/**
 * GET /api/reports/system
 * Generate comprehensive system-wide report
 */
router.get(
  "/system",
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
  ReportsController.getSystemReport
);

// ========================================
// ORGANIZATION REPORTS
// ========================================

/**
 * GET /api/reports/organizations
 * Get all organizations report (for system owner)
 */
router.get(
  "/organizations",
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
  ReportsController.getAllOrganizationsReport
);

/**
 * GET /api/reports/organizations/:organizationId
 * Get detailed organization report
 */
router.get(
  "/organizations/:organizationId",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Valid organization ID is required"),
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
  ReportsController.getOrganizationReport
);

// ========================================
// BORROWER REPORTS
// ========================================

/**
 * GET /api/reports/borrowers
 * Get borrower report with optional filtering
 */
router.get(
  "/borrowers",
  [
    query("organizationId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a valid integer"),
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
  ReportsController.getBorrowerReport
);

// ========================================
// LOAN PORTFOLIO REPORTS
// ========================================

/**
 * GET /api/reports/loans
 * Get loan portfolio report
 */
router.get(
  "/loans",
  [
    query("organizationId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a valid integer"),
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
  ReportsController.getLoanPortfolioReport
);

// ========================================
// FINANCIAL REPORTS
// ========================================

/**
 * GET /api/reports/financial
 * Get financial report
 */
router.get(
  "/financial",
  [
    query("organizationId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a valid integer"),
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
  ReportsController.getFinancialReport
);

// ========================================
// CUSTOM REPORTS
// ========================================

/**
 * POST /api/reports/custom
 * Generate custom report based on specified metrics
 */
router.post(
  "/custom",
  ReportsController.generateCustomReport
);

// ========================================
// REPORT EXPORTS
// ========================================

/**
 * POST /api/reports/export/csv
 * Export report data as CSV
 */
router.post(
  "/export/csv",
  [
    body("reportType")
      .isString()
      .notEmpty()
      .withMessage("Report type is required"),
    body("data")
      .isObject()
      .withMessage("Data is required"),
    handleValidationErrors,
  ],
  ReportsController.exportReportAsCSV
);

/**
 * POST /api/reports/export/pdf
 * Export report data as PDF (placeholder)
 */
router.post(
  "/export/pdf",
  [
    body("reportType")
      .isString()
      .notEmpty()
      .withMessage("Report type is required"),
    body("data")
      .isObject()
      .withMessage("Data is required"),
    handleValidationErrors,
  ],
  ReportsController.exportReportAsPDF
);

export default router;