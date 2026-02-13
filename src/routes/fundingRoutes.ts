// @ts-nocheck
import { Router } from "express"
import { body, param } from "express-validator"
import { FundingController } from "../controllers/fundingController"
import { authenticate } from "../middleware/auth"
import  tenantIsolation  from "../middleware/tenantIsolation"
import { handleValidationErrors, validateFileUpload } from "../middleware/validation"
import { uploadFields } from "../utils/fileUpload"
import upload from "../helpers/multer"

const router = Router()
const fundingController = new FundingController()



const shareCapitalValidation = [
  body("shareholderId").isInt({ min: 1 }).withMessage("Valid shareholder ID is required"),
  body("shareholderType").isIn(["individual", "institution"]).withMessage("Shareholder type must be individual or institution"),
  body("dateOfContribution").isISO8601().withMessage("Valid contribution date is required"),
  body("typeOfShare").isIn(["ordinary", "preference", "cumulative_preference", "redeemable", "other"]).withMessage("Valid share type is required"),
  body("numberOfShares").isInt({ min: 1 }).withMessage("Number of shares must be positive"),
  body("valuePerShare").isFloat({ min: 0 }).withMessage("Value per share must be positive"),
  body("paymentDetails.paymentMethod").notEmpty().withMessage("Payment method is required"),
  body("paymentDetails.paymentDate").isISO8601().withMessage("Valid payment date is required"),
  body("paymentDetails.paymentReference").notEmpty().withMessage("Payment reference is required"),
]

// Validation rules
const borrowingValidation = [
  body("lenderType").notEmpty().withMessage("Lender type is required"),
  body("lenderName").notEmpty().withMessage("Lender name is required"),
  body("lenderAddress.country").notEmpty().withMessage("Lender address country is required"),
  body("lenderAddress.province").notEmpty().withMessage("Lender address province is required"),
  body("amountBorrowed").isFloat({ min: 0 }).withMessage("Amount borrowed must be positive"),
  body("paymentSchedule.period").notEmpty().withMessage("Payment period is required")
]

const idValidation = [param("id").isInt().withMessage("Valid ID is required")]


const operationalFundsValidation = [
  body("fundSource").notEmpty().withMessage("Fund source is required"),
  body("amountCommitted").isFloat({ min: 0 }).withMessage("Amount committed must be positive"),
  body("commitmentDate").isISO8601().withMessage("Valid commitment date is required"),
];


// Add this custom validation to check for existing operational funds
const checkExistingOperationalFunds = async (req: any, res: any, next: any) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: "Organization ID required" });
    }

    const existingFunds = await dbConnection
      .getRepository(OperationalFunds)
      .findOne({ where: { organization: { id: organizationId } } });

    if (existingFunds) {
      return res.status(400).json({
        success: false,
        message: "Operational funds already exist. Only one operational fund account is allowed per organization."
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
const borrowingIdValidation = [param("id").isInt().withMessage("Valid borrowing ID is required")]


router.post(
  "/borrowing/:id/repayment",
  authenticate,
  tenantIsolation,
  handleValidationErrors, 
  fundingController.recordBorrowingRepayment,
)


router.put(
  "/operational/:id/amount",
  authenticate,
  tenantIsolation,
  handleValidationErrors,
  fundingController.updateOperationalFundsAmount
)


router.get(
  "/operational/:id/history",
  authenticate,
  tenantIsolation,
  handleValidationErrors,
  fundingController.getOperationalHistory
)

router.post(
  "/borrowing",
  authenticate,
  tenantIsolation,
  uploadFields,
  validateFileUpload,
  borrowingValidation,
  handleValidationErrors,
  fundingController.recordBorrowing,
)

router.put(
  "/borrowing/:id",
  authenticate,
  tenantIsolation,
  borrowingIdValidation,
  handleValidationErrors,
  fundingController.updateBorrowing,
)
router.delete(
  "/borrowing/:id",
  authenticate,
  tenantIsolation,
  borrowingIdValidation,
  handleValidationErrors,
  fundingController.deleteBorrowing,
)

// Granted funds operations
router.post(
  "/grants",
  authenticate,
  tenantIsolation,
  uploadFields,
  validateFileUpload,
  handleValidationErrors,
  fundingController.recordGrantedFunds,
)

router.post(
  "/operational",
  authenticate,
  tenantIsolation,
  checkExistingOperationalFunds,
  operationalFundsValidation,
  handleValidationErrors,
  fundingController.recordOperationalFunds,
);

router.get("/structure", authenticate, tenantIsolation, fundingController.getFundingStructure)

router.post(
  "/share-capital",
  authenticate,
  tenantIsolation,
  upload.fields([
    { name: "paymentProof", maxCount: 1 }
  ]),
  validateFileUpload,
  shareCapitalValidation,
  handleValidationErrors,
  fundingController.recordShareCapital,
)

router.put(
  "/share-capital/:id",
  authenticate,
  tenantIsolation,
  upload.fields([
    { name: "paymentProof", maxCount: 1 }
  ]),
  validateFileUpload,
  idValidation,
  shareCapitalValidation,
  handleValidationErrors,
  fundingController.updateShareCapital,
)

router.delete(
  "/share-capital/:id",
  authenticate,
  tenantIsolation,
  idValidation,
  handleValidationErrors,
  fundingController.deleteShareCapital,
)

router.get(
  "/share-capital",
  authenticate,
  tenantIsolation,
  fundingController.getShareCapital,
)

const grantIdValidation = [param("id").isInt().withMessage("Valid grant ID is required")]
const operationalIdValidation = [param("id").isInt().withMessage("Valid operational fund ID is required")]


router.put(
  "/grants/:id",
  authenticate,
  tenantIsolation,
  uploadFields,
  validateFileUpload,
  grantIdValidation,
  handleValidationErrors,
  fundingController.updateGrantedFunds
)

router.delete(
  "/grants/:id",
  authenticate,
  tenantIsolation,
  grantIdValidation,
  handleValidationErrors,
  fundingController.deleteGrantedFunds
)

router.put(
  "/operational/:id",
  authenticate,
  tenantIsolation,
  operationalIdValidation,
  operationalFundsValidation,
  handleValidationErrors,
  fundingController.updateOperationalFunds
)

router.delete(
  "/operational/:id",
  authenticate,
  tenantIsolation,
  operationalIdValidation,
  handleValidationErrors,
  fundingController.deleteOperationalFunds
)

export default router