
import { Router } from "express";
import { param } from "express-validator";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { handleValidationErrors } from "../middleware/validation";
import NotificationController from "../controllers/NotificationController";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

/**
 * GET /api/organizations/:organizationId/notifications/summary
 * Returns aggregated notification counts for the fixed header bell icon.
 */
router.get(
  "/summary",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Valid organization ID is required"),
    handleValidationErrors,
  ],
  NotificationController.getNotificationSummary
);

export default router;