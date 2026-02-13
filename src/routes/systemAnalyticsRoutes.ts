import { Router } from "express";
import { query } from "express-validator";
import SystemAnalyticsController from "../controllers/systemAnalyticsController";
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
// SYSTEM ANALYTICS (Platform-wide)
// ========================================
router.get(
  "/system",
  SystemAnalyticsController.getSystemAnalytics
);

// ========================================
// USAGE STATISTICS
// ========================================
router.get(
  "/usage",
  [
    query("timeRange")
      .optional()
      .isIn(['7d', '30d', '90d', '1y'])
      .withMessage("Time range must be 7d, 30d, 90d, or 1y"),
    handleValidationErrors,
  ],
  SystemAnalyticsController.getUsageStatistics
);

// ========================================
// PERFORMANCE REPORTS
// ========================================
router.get(
  "/performance",
  [
    query("period")
      .optional()
      .isIn(['monthly', 'quarterly', 'yearly'])
      .withMessage("Period must be monthly, quarterly, or yearly"),
    handleValidationErrors,
  ],
  SystemAnalyticsController.getPerformanceReports
);

// ========================================
// SYSTEM HEALTH
// ========================================
router.get(
  "/health",
  SystemAnalyticsController.getSystemHealth
);

// ========================================
// ORGANIZATION PERFORMANCE (For System Owner)
// ========================================
router.get(
  "/organizations/:organizationId",
  SystemAnalyticsController.getOrganizationPerformance
);

export default router;