import { Router } from "express";
import { body, param, query } from "express-validator";
import BorrowerController from "../controllers/borrowerController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { Gender, MaritalStatus, RelationshipType } from "../entities/BorrowerProfile";

const router = Router({ mergeParams: true });

// Apply middleware to all routes
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

/**
 * Create Borrower Profile
 * POST /api/organizations/:organizationId/borrowers
 * Maintains 100% original validation with enhanced field checks
 */
router.post(
  "/",
  [
    // Table 2.1 - Column 2: Names validation
    body("firstName")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("First name must be between 2 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("First name contains invalid characters"),

    body("lastName")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Last name must be between 2 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("Last name contains invalid characters"),

    body("middleName")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Middle name must be between 1 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("Middle name contains invalid characters"),

    // Table 2.1 - Column 3: National ID validation (16 digits)
    body("nationalId")
      .trim()
      .isLength({ min: 16, max: 16 })
      .withMessage("National ID must be exactly 16 characters")
      .matches(/^\d{16}$/)
      .withMessage("National ID must contain only numbers"),

    // Table 2.1 - Column 5: Gender validation (M/F/Other)
    body("gender")
      .isIn(Object.values(Gender))
      .withMessage(`Gender must be one of: ${Object.values(Gender).join(", ")}`),

    // Age validation (18-100 years)
    body("dateOfBirth")
      .isISO8601()
      .withMessage("Date of birth must be a valid date")
      .custom((value) => {
        if (value) {
          const birthDate = new Date(value);
          const today = new Date();
          const age = today.getFullYear() - birthDate.getFullYear();
          if (age < 18 || age > 100) {
            throw new Error("Age must be between 18 and 100 years");
          }
        }
        return true;
      }),

    // Table 2.1 - Column 7: Marital status validation
    body("maritalStatus")
      .isIn(Object.values(MaritalStatus))
      .withMessage(`Marital status must be one of: ${Object.values(MaritalStatus).join(", ")}`),

    // Table 2.1 - Column 4: Telephone validation (Format: +XXX-XXX-XXXX)
    body("primaryPhone")
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Primary phone must be a valid phone number"),

    body("alternativePhone")
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Alternative phone must be a valid phone number"),

    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),

    // Table 2.2 - Column 13-16: Address validation (District/Sector/Cell/Village)
    body("address")
      .isObject()
      .withMessage("Address must be an object"),

    body("address.district")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("District must be between 1 and 100 characters"),

    body("address.sector")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Sector must be between 1 and 100 characters"),

    body("address.cell")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Cell must be between 1 and 100 characters"),

    body("address.village")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Village must be between 1 and 100 characters"),

    // Table 2.1 - Column 6: Relationship with NDFSP
    body("relationshipWithNDFSP")
      .optional()
      .isIn(Object.values(RelationshipType))
      .withMessage(`Relationship type must be one of: ${Object.values(RelationshipType).join(", ")}`),

    // Table 2.1 - Column 8: Previous loans paid on time
    body("previousLoansPaidOnTime")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Previous loans paid on time must be a non-negative integer"),

    body("occupation")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Occupation must not exceed 100 characters"),

    body("monthlyIncome")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Monthly income must be a non-negative number"),

    body("incomeSource")
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage("Income source must not exceed 255 characters"),

    body("notes")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Notes must not exceed 1000 characters"),

    handleValidationErrors,
  ],
  BorrowerController.createBorrowerProfile
);

/**
 * Get Borrower Profiles with Pagination
 * GET /api/organizations/:organizationId/borrowers
 * Maintains 100% original functionality
 */
router.get(
  "/",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),

    query("search")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Search query must not exceed 100 characters"),

    query("isActive")
      .optional()
      .isBoolean()
      .withMessage("isActive must be a boolean value"),

    handleValidationErrors,
  ],
  BorrowerController.getBorrowerProfiles
);

/**
 * Get Borrower by ID
 * GET /api/organizations/:organizationId/borrowers/:borrowerId
 * Maintains 100% original functionality
 */
router.get(
  "/:borrowerId",
  [
    param("borrowerId")
      .isInt({ min: 1 })
      .withMessage("Borrower ID must be a positive integer"),

    handleValidationErrors,
  ],
  BorrowerController.getBorrowerById
);

/**
 * Update Borrower Profile
 * PUT /api/organizations/:organizationId/borrowers/:borrowerId
 * Maintains 100% original functionality with enhanced validation
 */
router.put(
  "/:borrowerId",
  [
    param("borrowerId")
      .isInt({ min: 1 })
      .withMessage("Borrower ID must be a positive integer"),

    // All fields are optional for update
    body("firstName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("First name must be between 2 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("First name contains invalid characters"),

    body("lastName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Last name must be between 2 and 100 characters")
      .matches(/^[A-Za-z\s\-'.]+$/)
      .withMessage("Last name contains invalid characters"),

    body("middleName")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Middle name must be between 1 and 100 characters"),

    body("nationalId")
      .optional()
      .trim()
      .isLength({ min: 16, max: 16 })
      .withMessage("National ID must be exactly 16 characters")
      .matches(/^\d{16}$/)
      .withMessage("National ID must contain only numbers"),

    body("gender")
      .optional()
      .isIn(Object.values(Gender))
      .withMessage(`Gender must be one of: ${Object.values(Gender).join(", ")}`),

    body("dateOfBirth")
      .optional()
      .isISO8601()
      .withMessage("Date of birth must be a valid date")
      .custom((value) => {
        if (value) {
          const birthDate = new Date(value);
          const today = new Date();
          const age = today.getFullYear() - birthDate.getFullYear();
          if (age < 18 || age > 100) {
            throw new Error("Age must be between 18 and 100 years");
          }
        }
        return true;
      }),

    body("maritalStatus")
      .optional()
      .isIn(Object.values(MaritalStatus))
      .withMessage(`Marital status must be one of: ${Object.values(MaritalStatus).join(", ")}`),

    body("primaryPhone")
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Primary phone must be a valid phone number"),

    body("alternativePhone")
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Alternative phone must be a valid phone number"),

    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),

    body("relationshipWithNDFSP")
      .optional()
      .isIn(Object.values(RelationshipType))
      .withMessage(`Relationship type must be one of: ${Object.values(RelationshipType).join(", ")}`),

    body("previousLoansPaidOnTime")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Previous loans paid on time must be a non-negative integer"),

    handleValidationErrors,
  ],
  BorrowerController.updateBorrowerProfile
);

/**
 * Delete Borrower Profile (Permanent)
 * DELETE /api/organizations/:organizationId/borrowers/:borrowerId
 * Maintains 100% original functionality
 */
router.delete(
  "/:borrowerId",
  [
    param("borrowerId")
      .isInt({ min: 1 })
      .withMessage("Borrower ID must be a positive integer"),

    handleValidationErrors,
  ],
  BorrowerController.deleteBorrowerProfile
);

/**
 * Get Borrower Statistics
 * GET /api/organizations/:organizationId/borrowers/:borrowerId/stats
 * Maintains 100% original functionality
 */
router.get(
  "/:borrowerId/stats",
  [
    param("borrowerId")
      .isInt({ min: 1 })
      .withMessage("Borrower ID must be a positive integer"),

    handleValidationErrors,
  ],
  BorrowerController.getBorrowerStats
);

router.put(
  "/:borrowerId/extend",
  [
    param("borrowerId")
      .isInt({ min: 1 })
      .withMessage("Borrower ID must be a positive integer"),

    // Personal Details - All Optional
    body("salutation")
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Salutation must not exceed 20 characters"),

    body("forename2")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Forename 2 must not exceed 50 characters"),

    body("forename3")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Forename 3 must not exceed 50 characters"),

    body("passportNo")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Passport number must not exceed 50 characters"),

    body("nationality")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Nationality must not exceed 50 characters"),

    body("taxNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Tax number must not exceed 50 characters"),

    body("drivingLicenseNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Driving license number must not exceed 50 characters"),

    body("socialSecurityNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Social security number must not exceed 50 characters"),

    body("healthInsuranceNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Health insurance number must not exceed 50 characters"),

    body("dependantsCount")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Dependants count must be a non-negative integer"),

    body("placeOfBirth")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Place of birth must not exceed 100 characters"),

    // Contact & Employment - All Optional
    body("workPhone")
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Work phone must be a valid phone number"),

    body("homePhone")
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Home phone must be a valid phone number"),

    body("fax")
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Fax must be a valid phone number"),

    body("employerName")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Employer name must not exceed 100 characters"),

    body("employerAddress1")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Employer address 1 must not exceed 200 characters"),

    body("employerAddress2")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Employer address 2 must not exceed 200 characters"),

    body("employerTown")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Employer town must not exceed 100 characters"),

    body("employerCountry")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Employer country must not exceed 100 characters"),

    body("incomeFrequency")
      .optional()
      .trim()
      .isIn(["weekly", "bi-weekly", "monthly", "annually", "other"])
      .withMessage("Income frequency must be valid"),

    // Group & Account Details - All Optional
    body("groupName")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Group name must not exceed 100 characters"),

    body("groupNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Group number must not exceed 50 characters"),

    body("accountNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Account number must not exceed 50 characters"),

    body("oldAccountNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Old account number must not exceed 50 characters"),

    body("accountType")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Account type must not exceed 50 characters"),

    body("accountStatus")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Account status must not exceed 50 characters"),

    body("classification")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Classification must not exceed 50 characters"),

    body("accountOwner")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Account owner must not exceed 100 characters"),

    body("jointLoanParticipants")
      .optional()
      .isArray()
      .withMessage("Joint loan participants must be an array"),

    body("currencyType")
      .optional()
      .trim()
      .isLength({ max: 10 })
      .withMessage("Currency type must not exceed 10 characters"),

    body("termsDuration")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Terms duration must be a non-negative integer"),

    body("repaymentTerm")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Repayment term must not exceed 50 characters"),

    // Financial & Loan Information - All Optional
    body("creditLimit")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Credit limit must be a non-negative number"),

    body("currentBalance")
      .optional()
      .isFloat()
      .withMessage("Current balance must be a number"),

    body("availableCredit")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Available credit must be a non-negative number"),

    body("currentBalanceIndicator")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Current balance indicator must not exceed 50 characters"),

    body("scheduledMonthlyPayment")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Scheduled monthly payment must be a non-negative number"),

    body("actualPaymentAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Actual payment amount must be a non-negative number"),

    body("amountPastDue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount past due must be a non-negative number"),

    body("installmentsInArrears")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Installments in arrears must be a non-negative integer"),

    body("daysInArrears")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Days in arrears must be a non-negative integer"),

    body("interestRate")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Interest rate must be between 0 and 100"),

    // Additional Categorization - All Optional
    body("nature")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Nature must not exceed 50 characters"),

    body("category")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Category must not exceed 50 characters"),

    body("sectorOfActivity")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Sector of activity must not exceed 100 characters"),

    // Date fields
    body("dateOpened")
      .optional()
      .isISO8601()
      .withMessage("Date opened must be a valid date"),

    body("dateClosed")
      .optional()
      .isISO8601()
      .withMessage("Date closed must be a valid date"),

    body("lastPaymentDate")
      .optional()
      .isISO8601()
      .withMessage("Last payment date must be a valid date"),

    body("firstPaymentDate")
      .optional()
      .isISO8601()
      .withMessage("First payment date must be a valid date"),

    body("approvalDate")
      .optional()
      .isISO8601()
      .withMessage("Approval date must be a valid date"),

    body("finalPaymentDate")
      .optional()
      .isISO8601()
      .withMessage("Final payment date must be a valid date"),

    handleValidationErrors,
  ],
  BorrowerController.extendBorrowerProfile
);

export default router;