import { Router } from "express";
import { body, query, param } from "express-validator";
import SecurityController from "../controllers/securityController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware } from "../middleware/tenantIsolation";
import { AuditAction, AuditResource, AuditStatus } from "../entities/AuditLog";
import { ComplianceType, ComplianceStatus } from "../entities/ComplianceReport";

const router = Router();

router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);


router.get(
  "/overview",
  SecurityController.getSecurityOverview
);

router.get(
  "/audit-logs",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid date"),
    query("userId")
      .optional()
      .isInt()
      .withMessage("User ID must be an integer"),
    query("action")
      .optional()
      .isIn(Object.values(AuditAction))
      .withMessage("Invalid action value"),
    query("resource")
      .optional()
      .isIn(Object.values(AuditResource))
      .withMessage("Invalid resource value"),
    query("status")
      .optional()
      .isIn(Object.values(AuditStatus))
      .withMessage("Invalid status value"),
    query("search")
      .optional()
      .isString()
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),
    handleValidationErrors,
  ],
  SecurityController.getAuditLogs
);


router.get(
  "/audit-logs/:id",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Valid audit log ID is required"),
    handleValidationErrors,
  ],
  SecurityController.getAuditLogById
);


router.post(
  "/audit-logs",
  [
    body("action")
      .isIn(Object.values(AuditAction))
      .withMessage("Valid action is required"),
    body("resource")
      .isIn(Object.values(AuditResource))
      .withMessage("Valid resource is required"),
    body("status")
      .optional()
      .isIn(Object.values(AuditStatus))
      .withMessage("Invalid status value"),
    body("resourceId")
      .optional()
      .isString()
      .isLength({ max: 100 }),
    body("description")
      .optional()
      .isString()
      .isLength({ max: 1000 }),
    handleValidationErrors,
  ],
  SecurityController.createAuditLog
);


router.get(
  "/organizations/:organizationId/audit-logs",
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
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid date"),
    query("userId")
      .optional()
      .isInt()
      .withMessage("User ID must be an integer"),
    query("action")
      .optional()
      .isIn(Object.values(AuditAction))
      .withMessage("Invalid action value"),
    query("resource")
      .optional()
      .isIn(Object.values(AuditResource))
      .withMessage("Invalid resource value"),
    query("status")
      .optional()
      .isIn(Object.values(AuditStatus))
      .withMessage("Invalid status value"),
    query("search")
      .optional()
      .isString()
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),
    handleValidationErrors,
  ],
  SecurityController.getOrganizationAuditLogs   // ← new controller method (see below)
);


router.get(
  "/compliance",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("type")
      .optional()
      .isIn(Object.values(ComplianceType))
      .withMessage("Invalid compliance type"),
    query("status")
      .optional()
      .isIn(Object.values(ComplianceStatus))
      .withMessage("Invalid status value"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid date"),
    query("search")
      .optional()
      .isString()
      .isLength({ max: 100 }),
    handleValidationErrors,
  ],
  SecurityController.getComplianceReports
);


router.get(
  "/compliance/:id",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Valid report ID is required"),
    handleValidationErrors,
  ],
  SecurityController.getComplianceReportById
);


router.post(
  "/compliance/generate",
  [
    body("type")
      .isIn(Object.values(ComplianceType))
      .withMessage("Valid compliance type is required"),
    body("periodStart")
      .optional()
      .isISO8601()
      .withMessage("Period start must be a valid date"),
    body("periodEnd")
      .optional()
      .isISO8601()
      .withMessage("Period end must be a valid date"),
    body("sections")
      .optional()
      .isArray()
      .withMessage("Sections must be an array"),
    handleValidationErrors,
  ],
  SecurityController.generateComplianceReport
);

export default router;