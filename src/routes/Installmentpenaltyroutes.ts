
import { Router } from "express";
import { body, param, query } from "express-validator";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { handleValidationErrors } from "../middleware/validation";
import InstallmentPenaltyController from "../controllers/Installmentpenaltycontroller";

const router = Router({ mergeParams: true });

// ── Shared middleware ──────────────────────────────────────────────────────────
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

// ── Validators ────────────────────────────────────────────────────────────────

const orgIdValidator = param("organizationId")
  .isInt({ min: 1 })
  .withMessage("Valid organization ID required");

const penaltyIdValidator = param("penaltyId")
  .isInt({ min: 1 })
  .withMessage("Valid penalty ID required");

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/organizations/:organizationId/installment-penalties/summary
 * Dashboard stats — must be before /:penaltyId routes to avoid param conflict
 */
router.get(
  "/summary",
  [orgIdValidator, handleValidationErrors],
  InstallmentPenaltyController.getPenaltySummary
);

/**
 * GET /api/organizations/:organizationId/installment-penalties/overdue-installments
 * Returns overdue schedules without an active penalty.
 */
router.get(
  "/overdue-installments",
  [orgIdValidator, handleValidationErrors],
  InstallmentPenaltyController.getOverdueInstallments
);

/**
 * GET /api/organizations/:organizationId/installment-penalties
 * List all penalties. Query: status, loanId, page, limit
 */
router.get(
  "/",
  [
    orgIdValidator,
    query("status").optional().isIn(["active", "waived", "settled"]),
    query("loanId").optional().isInt({ min: 1 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    handleValidationErrors,
  ],
  InstallmentPenaltyController.listPenalties
);

/**
 * POST /api/organizations/:organizationId/installment-penalties
 * Apply a new penalty to an overdue installment.
 */
router.post(
  "/",
  [
    orgIdValidator,
    body("repaymentScheduleId").isInt({ min: 1 }).withMessage("Valid repaymentScheduleId required"),
    body("dailyInterestRate")
      .isFloat({ min: 0.0001, max: 100 })
      .withMessage("dailyInterestRate must be between 0.0001 and 100"),
    body("notes").optional().isString().isLength({ max: 500 }),
    handleValidationErrors,
  ],
  InstallmentPenaltyController.applyPenalty
);

/**
 * GET /api/organizations/:organizationId/installment-penalties/:penaltyId
 */
router.get(
  "/:penaltyId",
  [orgIdValidator, penaltyIdValidator, handleValidationErrors],
  InstallmentPenaltyController.getPenalty
);

/**
 * PATCH /api/organizations/:organizationId/installment-penalties/:penaltyId/recalculate
 */
router.patch(
  "/:penaltyId/recalculate",
  [orgIdValidator, penaltyIdValidator, handleValidationErrors],
  InstallmentPenaltyController.recalculatePenalty
);

/**
 * PATCH /api/organizations/:organizationId/installment-penalties/:penaltyId/waive
 */
router.patch(
  "/:penaltyId/waive",
  [
    orgIdValidator,
    penaltyIdValidator,
    body("reason").isString().isLength({ min: 3, max: 500 }).withMessage("Reason required (min 3 chars)"),
    handleValidationErrors,
  ],
  InstallmentPenaltyController.waivePenalty
);

/**
 * PATCH /api/organizations/:organizationId/installment-penalties/:penaltyId/settle
 */
router.patch(
  "/:penaltyId/settle",
  [
    orgIdValidator,
    penaltyIdValidator,
    body("settledAmount").isFloat({ min: 0 }).withMessage("settledAmount must be >= 0"),
    handleValidationErrors,
  ],
  InstallmentPenaltyController.settlePenalty
);

export default router;