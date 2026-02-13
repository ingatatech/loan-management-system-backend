import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  PricingController,
  createPricingValidation,
  updatePricingValidation,
  pricingIdValidation,
} from "../controllers/Pricingcontroller";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES  (used by homepage — no auth required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/pricing
 * Returns all *active* pricing items ordered by sortOrder.
 * Consumed by the public HomePage to render the dynamic pricing section.
 */
router.get("/", PricingController.getAll);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTES  (system_owner only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/pricing/all
 * Returns ALL items including inactive — dashboard management view.
 */
router.get(
  "/all",
  authenticate,
  PricingController.getAllAdmin
);

/**
 * GET /api/pricing/:id
 * Get single pricing item by ID.
 */
router.get(
  "/:id",
  authenticate,
  pricingIdValidation,
  PricingController.getOne
);

/**
 * POST /api/pricing
 * Create a new pricing item.
 */
router.post(
  "/",
  authenticate,
  createPricingValidation,
  PricingController.create
);

/**
 * PUT /api/pricing/reorder
 * Bulk reorder — must be defined BEFORE /:id to avoid param collision.
 */
router.put(
  "/reorder",
  authenticate,
  PricingController.reorder
);

/**
 * PUT /api/pricing/:id
 * Update an existing pricing item.
 */
router.put(
  "/:id",
  authenticate,
  updatePricingValidation,
  PricingController.update
);

/**
 * PATCH /api/pricing/:id/toggle
 * Toggle isActive for a pricing item.
 */
router.patch(
  "/:id/toggle",
  authenticate,
  pricingIdValidation,
  PricingController.toggleActive
);

/**
 * DELETE /api/pricing/:id
 * Soft-delete a pricing item.
 */
router.delete(
  "/:id",
  authenticate,
  pricingIdValidation,
  PricingController.remove
);

export default router;