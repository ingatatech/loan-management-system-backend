
import { Router } from "express";
import { param, body } from "express-validator";
import ActualMoneyController from "../controllers/actualMoneyController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { 
  tenantIsolationMiddleware, 
  validateOrganizationOwnership 
} from "../middleware/tenantIsolation";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

router.get(
  "/",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),

    handleValidationErrors,
  ],
  ActualMoneyController.getActualMoney
);

/**
 * POST /api/organizations/:organizationId/actual-money/validate-disbursement
 * Validate if a specific loan amount can be disbursed
 * 
 * Body:
 * - requestedAmount: number (required) - The loan amount to validate
 * 
 * Returns:
 * - canDisburse: boolean - Whether the loan can be disbursed
 * - availableAmount: number - Maximum amount that can be lent
 * - shortfall: number - Amount short if cannot disburse
 */
router.post(
  "/validate-disbursement",
  [
    param("organizationId")
      .isInt({ min: 1 })
      .withMessage("Organization ID must be a positive integer"),

    body("requestedAmount")
      .isFloat({ min: 0.01 })
      .withMessage("Requested amount must be greater than 0"),

    handleValidationErrors,
  ],
  ActualMoneyController.validateDisbursement
);

export default router;

// ============================================================================
// HOW TO INTEGRATE IN YOUR MAIN APP.TS OR INDEX.TS
// ============================================================================

/*
import actualMoneyRoutes from "./routes/actualMoneyRoutes";

// Add this route
app.use("/api/organizations/:organizationId/actual-money", actualMoneyRoutes);
*/

// ============================================================================
// EXAMPLE API USAGE
// ============================================================================

/*
1. GET ACTUAL MONEY CALCULATION
   GET /api/organizations/1/actual-money
   
   Response:
   {
     "success": true,
     "message": "Actual money calculation completed successfully",
     "data": {
       "totalShareCapital": 10000000,
       "totalOperationalFundsAvailable": 8000000,
       "totalGrantedFundsAvailable": 5000000,
       "totalLoanRepaymentsReceived": 3000000,
       "totalDisbursedLoans": 18000000,
       "totalOperationalExpenses": 1000000,
       "totalReservedFunds": 500000,
       "totalProvisionsRequired": 1150000,
       "totalInflows": 26000000,
       "totalOutflows": 19500000,
       "actualMoneyAvailable": 6500000,
       "maximumLendableAmount": 4350000,
       "lendingCapacityPercentage": 16.73,
       "breakdown": { ... },
       "warnings": [],
       "canLendNewLoans": true
     }
   }

2. VALIDATE LOAN DISBURSEMENT
   POST /api/organizations/1/actual-money/validate-disbursement
   Body: { "requestedAmount": 5000000 }
   
   Response (if can disburse):
   {
     "success": true,
     "message": "Loan can be disbursed",
     "data": {
       "canDisburse": true,
       "availableAmount": 4350000,
       "shortfall": 0
     }
   }
   
   Response (if cannot disburse):
   {
     "success": true,
     "message": "Insufficient funds. Shortfall: 650000.00",
     "data": {
       "canDisburse": false,
       "availableAmount": 4350000,
       "shortfall": 650000
     }
   }
*/