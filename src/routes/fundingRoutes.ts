import { Router } from "express"
import { body, param } from "express-validator"
import { FundingController } from "../controllers/fundingController"
import { authenticate } from "../middleware/auth"
import  tenantIsolation  from "../middleware/tenantIsolation"
import { requireClient, requireSystemOwner } from "../middleware/rbac"
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
  body("paymentSchedule.period").notEmpty().withMessage("Payment period is required"),
  body("paymentSchedule.interestRate").isFloat({ min: 0 }).withMessage("Interest rate must be positive"),
]

const idValidation = [param("id").isInt().withMessage("Valid ID is required")]

// Updated validation for granted funds with proper date handling
const grantedFundsValidation = [
  body("grantorName").notEmpty().withMessage("Grantor name is required"),
  body("grantorAddress.country").optional({ nullable: true, checkFalsy: true }),
  body("amountGranted").isFloat({ min: 0 }).withMessage("Amount granted must be positive"),
  body("grantPurpose").notEmpty().withMessage("Grant purpose is required"),
  body("grantConditions").isArray().withMessage("Grant conditions must be an array"),
  
  // Required date fields
  body("grantDate")
    .notEmpty().withMessage("Grant date is required")
    .isISO8601().withMessage("Grant date must be a valid date"),
  body("projectStartDate")
    .notEmpty().withMessage("Project start date is required")
    .isISO8601().withMessage("Project start date must be a valid date"),
  body("projectEndDate")
    .notEmpty().withMessage("Project end date is required")
    .isISO8601().withMessage("Project end date must be a valid date"),
    
  // Optional date fields - allow empty strings but validate if provided
  body("disbursementDate")
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage("Disbursement date must be a valid date"),
  body("nextReportDue")
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage("Next report due date must be a valid date"),
    
  // Optional string fields
  body("reportingFrequency")
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage("Reporting frequency must be a string"),
    
  // Grant type validation
  body("grantType")
    .optional()
    .isIn(["development", "emergency", "capacity_building", "infrastructure", "research", "educational", "healthcare", "other"])
    .withMessage("Invalid grant type"),
    
  // Status validation
  body("status")
    .optional()
    .isIn(["pending", "approved", "disbursed", "completed", "cancelled", "suspended"])
    .withMessage("Invalid grant status"),
    
  // Numeric validations
  body("amountDisbursed")
    .optional()
    .isFloat({ min: 0 }).withMessage("Amount disbursed must be positive"),
  body("amountUtilized")
    .optional()
    .isFloat({ min: 0 }).withMessage("Amount utilized must be positive"),
    
  // Boolean validations
  body("isActive")
    .optional()
    .isBoolean().withMessage("isActive must be a boolean"),
  body("requiresReporting")
    .optional()
    .isBoolean().withMessage("requiresReporting must be a boolean"),
    
  // Array validations
  body("reportingDocuments")
    .optional()
    .isArray().withMessage("Reporting documents must be an array"),
  body("complianceDocuments")
    .optional()
    .isArray().withMessage("Compliance documents must be an array"),
  body("milestones")
    .optional()
    .isArray().withMessage("Milestones must be an array"),
    
  // Grant conditions validation
  body("grantConditions.*.condition")
    .notEmpty().withMessage("Grant condition text is required"),
  body("grantConditions.*.description")
    .notEmpty().withMessage("Grant condition description is required"),
  body("grantConditions.*.isCompleted")
    .isBoolean().withMessage("Grant condition completion status must be a boolean"),
  body("grantConditions.*.dueDate")
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage("Grant condition due date must be a valid date"),
    
  // Milestones validation (if provided)
  body("milestones.*.milestoneNumber")
    .optional()
    .isInt({ min: 1 }).withMessage("Milestone number must be a positive integer"),
  body("milestones.*.title")
    .optional()
    .notEmpty().withMessage("Milestone title is required"),
  body("milestones.*.description")
    .optional()
    .notEmpty().withMessage("Milestone description is required"),
  body("milestones.*.targetDate")
    .optional()
    .isISO8601().withMessage("Milestone target date must be a valid date"),
  body("milestones.*.budgetAllocation")
    .optional()
    .isFloat({ min: 0 }).withMessage("Milestone budget allocation must be positive"),
  body("milestones.*.isCompleted")
    .optional()
    .isBoolean().withMessage("Milestone completion status must be a boolean"),
]

const operationalFundsValidation = [
  body("fundSource").notEmpty().withMessage("Fund source is required"),
  body("amountCommitted").isFloat({ min: 0 }).withMessage("Amount committed must be positive"),
  body("commitmentDate").isISO8601().withMessage("Valid commitment date is required"),
]

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
  requireClient,
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
  requireClient,
  tenantIsolation,
  borrowingIdValidation,
  handleValidationErrors,
  fundingController.updateBorrowing,
)
router.delete(
  "/borrowing/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  borrowingIdValidation,
  handleValidationErrors,
  fundingController.deleteBorrowing,
)

// Granted funds operations
router.post(
  "/grants",
  authenticate,
  requireClient,
  tenantIsolation,
  uploadFields,
  validateFileUpload,
  grantedFundsValidation,
  handleValidationErrors,
  fundingController.recordGrantedFunds,
)

router.post(
  "/operational",
  authenticate,
  requireClient,
  tenantIsolation,
  operationalFundsValidation,
  handleValidationErrors,
  fundingController.recordOperationalFunds,
)

router.get("/structure", authenticate, tenantIsolation, fundingController.getFundingStructure)

router.post(
  "/share-capital",
  authenticate,
  requireClient,
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
  requireClient,
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
  requireClient,
  tenantIsolation,
  idValidation,
  handleValidationErrors,
  fundingController.deleteShareCapital,
)

router.get(
  "/share-capital",
  authenticate,
  requireClient,
  tenantIsolation,
  fundingController.getShareCapital,
)

const grantIdValidation = [param("id").isInt().withMessage("Valid grant ID is required")]
const operationalIdValidation = [param("id").isInt().withMessage("Valid operational fund ID is required")]


router.put(
  "/grants/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  uploadFields,
  validateFileUpload,
  grantIdValidation,
  grantedFundsValidation,
  handleValidationErrors,
  fundingController.updateGrantedFunds
)

router.delete(
  "/grants/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  grantIdValidation,
  handleValidationErrors,
  fundingController.deleteGrantedFunds
)

router.put(
  "/operational/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  operationalIdValidation,
  operationalFundsValidation,
  handleValidationErrors,
  fundingController.updateOperationalFunds
)

router.delete(
  "/operational/:id",
  authenticate,
  requireClient,
  tenantIsolation,
  operationalIdValidation,
  handleValidationErrors,
  fundingController.deleteOperationalFunds
)

export default router