// @ts-nocheck

import { Router } from "express";
import { body, param, query } from "express-validator";
import ShareholderController from "../controllers/shareholderController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
// import { requirePermission, Permission } from "../middleware/rbac";
import {  handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { uploadFields, handleMulterError } from "../helpers/multer";

const router = Router({ mergeParams: true });
// Apply authentication to all routes
router.use(authenticate);
router.use(checkFirstLogin);

/**
 * POST /organizations/:organizationId/individual-shareholders
 * Create a new individual shareholder
 */
router.post(
  "/individual-shareholders",
  [
    body("firstname")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("First name must be between 2 and 100 characters"),
    
    body("lastname")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Last name must be between 2 and 100 characters"),
    
    body("idPassport")
      .trim()
      .isLength({ min: 5, max: 50 })
      .withMessage("ID/Passport must be between 5 and 50 characters"),
    
    body("occupation")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Occupation must not exceed 100 characters"),
    

    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    
    body("nationality")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Nationality must not exceed 50 characters"),
    
    body("dateOfBirth")
      .optional()
      .isISO8601()
      .withMessage("Please provide a valid date of birth"),
    
    body("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Gender must be male, female, or other"),
    
    body("maritalStatus")
      .optional()
      .isIn(["single", "married", "divorced", "widowed"])
      .withMessage("Invalid marital status"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.createIndividualShareholder
);

/**
 * POST /organizations/:organizationId/institution-shareholders
 * Create a new institution shareholder
 */
router.post(
  "/institution-shareholders",
  [

    body("institutionName")
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Institution name must be between 2 and 255 characters"),
    
    body("tradingLicenseNumber")
      .trim()
      .isLength({ min: 5, max: 100 })
      .withMessage("Trading license number must be between 5 and 100 characters"),
    
    body("businessActivity")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Business activity must not exceed 500 characters"),
    
    body("keyRepresentatives")
      .isArray({ min: 1 })
      .withMessage("At least one key representative is required"),
    
    body("keyRepresentatives.*.name")
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Representative name must be between 2 and 255 characters"),
    
    body("keyRepresentatives.*.position")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Representative position must be between 2 and 100 characters"),
    
    body("keyRepresentatives.*.idPassport")
      .trim()
      .isLength({ min: 5, max: 50 })
      .withMessage("Representative ID/Passport must be between 5 and 50 characters"),
    
    body("keyRepresentatives.*.isAuthorizedSignatory")
      .isBoolean()
      .withMessage("Authorized signatory status must be a boolean"),
    
    body("institutionType")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Institution type must not exceed 100 characters"),
    
    body("incorporationDate")
      .optional()
      .isISO8601()
      .withMessage("Please provide a valid incorporation date"),
    
    body("registrationNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Registration number must not exceed 50 characters"),
    
    body("tinNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("TIN number must not exceed 50 characters"),
    
    body("phone")
      .optional()
      .isMobilePhone("any")
      .withMessage("Please provide a valid phone number"),
    
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    
    body("website")
      .optional()
      .isURL()
      .withMessage("Please provide a valid website URL"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.createInstitutionShareholder
);

/**
 * GET /organizations/:organizationId/individual-shareholders
 * Get individual shareholders with pagination and search
 */
router.get(
  "/individual-shareholders",
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
      .isLength({ max: 255 })
      .withMessage("Search term must not exceed 255 characters"),
    
    query("isActive")
      .optional()
      .isIn(["true", "false"])
      .withMessage("isActive must be 'true' or 'false'"),
    
    query("includeShareCapital")
      .optional()
      .isIn(["true", "false"])
      .withMessage("includeShareCapital must be 'true' or 'false'"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.getIndividualShareholders
);

/**
 * GET /organizations/:organizationId/institution-shareholders
 * Get institution shareholders with pagination and search
 */
router.get(
  "/institution-shareholders",
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
      .isLength({ max: 255 })
      .withMessage("Search term must not exceed 255 characters"),
    
    query("isActive")
      .optional()
      .isIn(["true", "false"])
      .withMessage("isActive must be 'true' or 'false'"),
    
    query("includeShareCapital")
      .optional()
      .isIn(["true", "false"])
      .withMessage("includeShareCapital must be 'true' or 'false'"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.getInstitutionShareholders
);

/**
 * POST /organizations/:organizationId/shareholders/:type/:id/documents
 * Upload shareholder document
 */
router.post(
  "/:type/:id/documents",
  [
    param("type")
      .isIn(["individual", "institution"])
      .withMessage("Shareholder type must be 'individual' or 'institution'"),
    
    param("id")
      .isInt({ min: 1 })
      .withMessage("Shareholder ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  uploadFields,
  handleMulterError,
  // Custom validation for documentType after file upload
  (req, res, next) => {
    const allowedDocumentTypes = ["idProof", "passportPhoto", "proofOfResidence", "tradingLicense", "certificateOfIncorporation"];
    const documentType = req.body.documentType;
    
    if (!documentType) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: [{ message: "Document type is required" }]
      });
    }
    
    if (!allowedDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: [{ message: "Invalid document type" }]
      });
    }
    
    next();
  },
  ShareholderController.uploadShareholderDocument
);

/**
 * PUT /organizations/:organizationId/individual-shareholders/:id
 * Update individual shareholder
 */
router.put(
  "/individual-shareholders/:id",
  [

    param("id")
      .isInt({ min: 1 })
      .withMessage("Shareholder ID must be a positive integer"),
    
    body("firstname")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("First name must be between 2 and 100 characters"),
    
    body("lastname")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Last name must be between 2 and 100 characters"),
    
    body("idPassport")
      .optional()
      .trim()
      .isLength({ min: 5, max: 50 })
      .withMessage("ID/Passport must be between 5 and 50 characters"),
    
    body("occupation")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Occupation must not exceed 100 characters"),
    
    body("phone")
      .optional()
      .isMobilePhone("any")
      .withMessage("Please provide a valid phone number"),
    
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    
    body("nationality")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Nationality must not exceed 50 characters"),
    
    body("dateOfBirth")
      .optional()
      .isISO8601()
      .withMessage("Please provide a valid date of birth"),
    
    body("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Gender must be male, female, or other"),
    
    body("maritalStatus")
      .optional()
      .isIn(["single", "married", "divorced", "widowed"])
      .withMessage("Invalid marital status"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.updateIndividualShareholder
);
/**
 * PUT /organizations/:organizationId/institution-shareholders/:id
 * Update institution shareholder
 */
router.put(
  "/institution-shareholders/:id",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Shareholder ID must be a positive integer"),
    
    body("institutionName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Institution name must be between 2 and 255 characters"),
    
    body("tradingLicenseNumber")
      .optional()
      .trim()
      .isLength({ min: 5, max: 100 })
      .withMessage("Trading license number must be between 5 and 100 characters"),
    
    body("businessActivity")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Business activity must not exceed 500 characters"),
    
    body("keyRepresentatives")
      .optional()
      .isArray({ min: 1 })
      .withMessage("At least one key representative is required"),
    
    body("keyRepresentatives.*.name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Representative name must be between 2 and 255 characters"),
    
    body("keyRepresentatives.*.position")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Representative position must be between 2 and 100 characters"),
    
    body("keyRepresentatives.*.idPassport")
      .optional()
      .trim()
      .isLength({ min: 5, max: 50 })
      .withMessage("Representative ID/Passport must be between 5 and 50 characters"),
    
    body("keyRepresentatives.*.isAuthorizedSignatory")
      .optional()
      .isBoolean()
      .withMessage("Authorized signatory status must be a boolean"),
    
    body("institutionType")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Institution type must not exceed 100 characters"),
    
    body("incorporationDate")
      .optional()
      .isISO8601()
      .withMessage("Please provide a valid incorporation date"),
    
    body("registrationNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Registration number must not exceed 50 characters"),
    
    body("tinNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("TIN number must not exceed 50 characters"),
    
    body("phone")
      .optional()
      .isMobilePhone("any")
      .withMessage("Please provide a valid phone number"),
    
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    
    body("website")
      .optional()
      .isURL()
      .withMessage("Please provide a valid website URL"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.updateInstitutionShareholder
);
/**
 * DELETE /organizations/:organizationId/individual-shareholders/:id
 * Delete individual shareholder
 */
router.delete(
  "/individual-shareholders/:id",
  [

    param("id")
      .isInt({ min: 1 })
      .withMessage("Shareholder ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.deleteIndividualShareholder
);


router.put(
  "/individual-shareholders/:id/extend",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Shareholder ID must be a positive integer"),
    
    body("accountNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Account number must not exceed 50 characters"),
    
    body("forename2")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Forename 2 must not exceed 100 characters"),
    
    body("forename3")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Forename 3 must not exceed 100 characters"),
    
    body("passportNo")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Passport number must not exceed 50 characters"),
    
    body("placeOfBirth")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Place of birth must not exceed 100 characters"),
    
    body("postalAddressLine1")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Postal address line 1 must not exceed 200 characters"),
    
    body("postalAddressLine2")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Postal address line 2 must not exceed 100 characters"),
    
    body("town")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Town must not exceed 100 characters"),
    
    body("country")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Country must not exceed 100 characters"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.extendIndividualShareholder
);

/**
 * PUT /organizations/:organizationId/institution-shareholders/:id/extend
 * Extend/Complete institution shareholder with additional fields
 */
router.put(
  "/institution-shareholders/:id/extend",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Shareholder ID must be a positive integer"),
    
    body("accountNumber")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Account number must not exceed 50 characters"),
    
    body("tradingName")
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage("Trading name must not exceed 255 characters"),
    
    body("companyRegNo")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Company registration number must not exceed 100 characters"),
    
    body("postalAddressLine1")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Postal address line 1 must not exceed 200 characters"),
    
    body("postalAddressLine2")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Postal address line 2 must not exceed 100 characters"),
    
    body("town")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Town must not exceed 100 characters"),
    
    body("country")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Country must not exceed 100 characters"),
    
    handleValidationErrors,
  ],
  tenantIsolationMiddleware,
  validateOrganizationOwnership,
  ShareholderController.extendInstitutionShareholder
);

export default router;