// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { body, param, query, validationResult, ValidationChain } from "express-validator";
import { UserRole } from "../entities/User";
import { ShareholderType, ShareType } from "../entities/ShareCapital";
import { LenderType } from "../entities/Borrowing";

export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value,
      })),
    });
    return;
  }
  
  next();
};


export const validateUserRegistration = [
  body("firstName")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("First name must be between 2 and 100 characters")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("First name must contain only letters and spaces"),
  
  body("lastName")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Last name must be between 2 and 100 characters")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Last name must contain only letters and spaces"),
  
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),

  body("role")
    .isIn(Object.values(UserRole))
    .withMessage("Invalid user role"),
  
  body("organizationId")
    .isInt({ min: 1 })
    .withMessage("Organization ID must be a positive integer"),
  
  handleValidationErrors,
];

export const validateUserLogin = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Username must be between 3 and 255 characters"),
  
  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters"),
  
  handleValidationErrors,
];

// Organization validation
export const validateOrganizationCreation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage("Organization name must be between 2 and 255 characters")
    .matches(/^[A-Za-z0-9\s\-._]+$/)
    .withMessage("Organization name contains invalid characters"),
  
  body("selectedCategories")
    .isArray({ min: 1 })
    .withMessage("At least one category must be selected"),
  
  body("address.country")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Country must be between 2 and 100 characters"),
  
  body("tinNumber")
    .optional()
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage("TIN number must be between 5 and 50 characters"),
  
  body("website")
    .optional()
    .isURL()
    .withMessage("Please provide a valid website URL"),
  
  body("email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),
  

  
  handleValidationErrors,
];

// Category validation
export const validateCategoryCreation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage("Category name must be between 2 and 255 characters"),
  
  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description must not exceed 1000 characters"),
  
  body("categoryCode")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Category code must not exceed 10 characters"),
  
  handleValidationErrors,
];

// Service validation
export const validateServiceCreation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage("Service name must be between 2 and 255 characters"),
  
  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description must not exceed 1000 characters"),
  
  body("categoryId")
    .isInt({ min: 1 })
    .withMessage("Category ID must be a positive integer"),
  
  body("basePrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Base price must be a positive number"),
  
  body("interestRate")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Interest rate must be between 0 and 100"),
  
  body("minLoanAmount")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Minimum loan amount must be a positive integer"),
  
  body("maxLoanAmount")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Maximum loan amount must be a positive integer")
    .custom((value, { req }) => {
      if (req.body.minLoanAmount && value < req.body.minLoanAmount) {
        throw new Error("Maximum loan amount must be greater than minimum loan amount");
      }
      return true;
    }),
  
  handleValidationErrors,
];

// Individual Shareholder validation
export const validateIndividualShareholderCreation = [
  body("firstname")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("First name must be between 2 and 100 characters")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("First name must contain only letters and spaces"),
  
  body("lastname")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Last name must be between 2 and 100 characters")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Last name must contain only letters and spaces"),
  
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
    .isLength({ max: 100 })
    .withMessage("Nationality must not exceed 100 characters"),
  
  body("dateOfBirth")
    .optional()
    .isISO8601()
    .toDate()
    .withMessage("Please provide a valid date of birth")
    .custom((value) => {
      const age = (Date.now() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 18) {
        throw new Error("Shareholder must be at least 18 years old");
      }
      return true;
    }),
  
  handleValidationErrors,
];

// Institution Shareholder validation
export const validateInstitutionShareholderCreation = [
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
    .isLength({ max: 1000 })
    .withMessage("Business activity must not exceed 1000 characters"),
  
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
    .withMessage("Authorized signatory must be a boolean value"),
  
  handleValidationErrors,
];

// Share Capital validation
export const validateShareCapitalCreation = [
  body("shareholderId")
    .isInt({ min: 1 })
    .withMessage("Shareholder ID must be a positive integer"),
  
  body("shareholderType")
    .isIn(Object.values(ShareholderType))
    .withMessage("Invalid shareholder type"),
  
  body("dateOfContribution")
    .isISO8601()
    .toDate()
    .withMessage("Please provide a valid contribution date")
    .custom((value) => {
      if (value > new Date()) {
        throw new Error("Contribution date cannot be in the future");
      }
      return true;
    }),
  
  body("typeOfShare")
    .isIn(Object.values(ShareType))
    .withMessage("Invalid share type"),
  
  body("numberOfShares")
    .isInt({ min: 1 })
    .withMessage("Number of shares must be a positive integer"),
  
  body("valuePerShare")
    .isFloat({ min: 0.01 })
    .withMessage("Value per share must be greater than 0"),
  
  body("paymentDetails.paymentMethod")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Payment method is required"),
  
  body("paymentDetails.paymentDate")
    .isISO8601()
    .toDate()
    .withMessage("Please provide a valid payment date"),
  
  body("paymentDetails.paymentReference")
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Payment reference must be between 3 and 100 characters"),
  
  handleValidationErrors,
];

// Borrowing validation
export const validateBorrowingCreation = [
  body("lenderType")
    .isIn(Object.values(LenderType))
    .withMessage("Invalid lender type"),
  
  body("lenderName")
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage("Lender name must be between 2 and 255 characters"),
  
  body("amountBorrowed")
    .isFloat({ min: 0.01 })
    .withMessage("Amount borrowed must be greater than 0"),
  
  body("interestRate")
    .isFloat({ min: 0, max: 100 })
    .withMessage("Interest rate must be between 0 and 100"),
  
  body("tenureMonths")
    .isInt({ min: 1 })
    .withMessage("Tenure must be at least 1 month"),
  
  body("borrowingDate")
    .isISO8601()
    .toDate()
    .withMessage("Please provide a valid borrowing date"),
  
  body("maturityDate")
    .isISO8601()
    .toDate()
    .withMessage("Please provide a valid maturity date")
    .custom((value, { req }) => {
      if (value <= new Date(req.body.borrowingDate)) {
        throw new Error("Maturity date must be after borrowing date");
      }
      return true;
    }),
  
  handleValidationErrors,
];

// File upload validation
export const validateFileUpload = [
  body("fileType")
    .optional()
    .isIn(["image", "document", "pdf"])
    .withMessage("Invalid file type"),
  
  handleValidationErrors,
];

// Parameter validations
export const validateId = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID must be a positive integer"),
  
  handleValidationErrors,
];

export const validateOrganizationId = [
  param("organizationId")
    .isInt({ min: 1 })
    .withMessage("Organization ID must be a positive integer"),
  
  handleValidationErrors,
];

// Query parameter validation
export const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  
  handleValidationErrors,
];

// Custom validation functions
export const customValidator = {
  isValidTinNumber: (value: string): boolean => {
    // Add your TIN number validation logic here
    return /^\d{9}$/.test(value);
  },
  
  isValidIdPassport: (value: string): boolean => {
    // Add ID/Passport validation logic here
    return value.length >= 5 && value.length <= 50;
  },
  
  isValidPhoneNumber: (value: string): boolean => {
    // Add phone number validation logic here
    return /^[+]?[\d\s\-()]{10,}$/.test(value);
  },
  
  isValidEmail: (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  },
};

// Sanitization middleware
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Remove potentially dangerous characters
    const sanitize = (obj: any): any => {
      if (typeof obj === "string") {
        return obj
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/javascript:/gi, "")
          .replace(/on\w+\s*=/gi, "")
          .trim();
      } else if (typeof obj === "object" && obj !== null) {
        const sanitized: any = {};
        for (const key in obj) {
          sanitized[key] = sanitize(obj[key]);
        }
        return sanitized;
      }
      return obj;
    };

    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);

    next();
  } catch (error) {
    console.error("Input sanitization error:", error);
    res.status(500).json({
      success: false,
      message: "Error sanitizing input",
    });
  }
};

export default handleValidationErrors;