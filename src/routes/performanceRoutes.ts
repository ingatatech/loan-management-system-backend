


import { Router } from "express";
import { getSystemPerformance } from "../controllers/performanceAnalyticsController";
import { authenticate } from "../middleware/auth";
import { requireSystemOwner } from "../middleware/rbac";

const router = Router();

/**
 * GET /api/system/performance
 * Returns per-organization system performance metrics.
 * Requires system_owner role.
 */
router.get("/performance", authenticate, requireSystemOwner, getSystemPerformance);

export default router;
