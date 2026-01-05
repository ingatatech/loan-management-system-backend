
import { Router } from "express";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import LoanPortfolioAnalysisController from "../controllers/LoanPortfolioAnalysisController";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

router.get(
  "/",
  LoanPortfolioAnalysisController.getPortfolioAnalysis
);

// Portfolio trends endpoint
router.get(
  "/trends",
  LoanPortfolioAnalysisController.getPortfolioTrends
);

export default router;