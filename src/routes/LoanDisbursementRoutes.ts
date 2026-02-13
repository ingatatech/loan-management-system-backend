
import { Router } from "express";
import { body as body2 } from "express-validator";
import UpdatedLoanDisbursementController from "../controllers/loanDisbursementController";
import { authenticate as authenticate2, checkFirstLogin as checkFirstLogin2 } from "../middleware/auth";
import { handleValidationErrors as handleValidationErrors2 } from "../middleware/validation";
import { tenantIsolationMiddleware as tenantIsolationMiddleware2, validateOrganizationOwnership as validateOrganizationOwnership2 } from "../middleware/tenantIsolation";
import { uploadFields as uploadFields2, handleMulterError as handleMulterError2 } from "../helpers/multer";

const router = Router({ mergeParams: true });

// Apply authentication and tenant isolation
router.use(authenticate2);
router.use(checkFirstLogin2);
router.use(tenantIsolationMiddleware2);
router.use(validateOrganizationOwnership2);

/**
 * STEPS 2-4: Contract Signature, Mortgage Registration, Loan Disbursement
 * POST /api/organizations/:organizationId/loan-disbursements/three-step
 * 
 * This endpoint handles the remaining 3 steps together
 * Uses borrowerAccountNumber from Step 1 for auto-fill
 */
router.post(
  "/three-step",
  uploadFields2,
  handleMulterError2,
  [
    body2("borrowerAccountNumber")
      .trim()
      .notEmpty()
      .withMessage("Borrower account number is required")
      .matches(/^ACC\d+$/)
      .withMessage("Invalid account number format"),

    // Step 2: Contract Signature
    body2("notaryName")
      .trim()
      .notEmpty()
      .withMessage("Notary name is required")
      .isLength({ min: 2, max: 200 })
      .withMessage("Notary name must be between 2 and 200 characters"),

    body2("notarizationDate")
      .isISO8601()
      .withMessage("Valid notarization date is required")
      .custom((value) => {
        const date = new Date(value);
        const today = new Date();
        if (date > today) {
          throw new Error("Notarization date cannot be in the future");
        }
        return true;
      }),

    body2("notaryLicenceNumber")
      .trim()
      .notEmpty()
      .withMessage("Notary licence number is required")
      .isLength({ min: 5, max: 100 })
      .withMessage("Notary licence number must be between 5 and 100 characters"),

    body2("notaryTelephone")
      .trim()
      .notEmpty()
      .withMessage("Notary telephone is required")
      .isLength({ min: 10, max: 20 })
      .withMessage("Notary telephone must be between 10 and 20 characters"),

    body2("addressDistrict")
      .trim()
      .notEmpty()
      .withMessage("District is required")
      .isLength({ max: 100 })
      .withMessage("District must be less than 100 characters"),

    body2("addressSector")
      .trim()
      .notEmpty()
      .withMessage("Sector is required")
      .isLength({ max: 100 })
      .withMessage("Sector must be less than 100 characters"),

    // Step 4: Disbursement
    body2("commissionRate")
      .isFloat({ min: 0, max: 100 })
      .withMessage("Commission rate must be between 0 and 100"),

    body2("insurancePolicyFees")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Insurance policy fees must be a positive number"),

    body2("fireInsurancePolicyFees")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Fire insurance policy fees must be a positive number"),

    body2("otherFees")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Other fees must be a positive number"),

    handleValidationErrors2,
  ],
  UpdatedLoanDisbursementController.createThreeStepDisbursement
);

router.get(
  "/with-accounts",

  UpdatedLoanDisbursementController.getDisbursedLoansWithAccounts
);

export default router;
