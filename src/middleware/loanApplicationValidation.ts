import { body } from "express-validator";
import { Gender, MaritalStatus } from "../entities/BorrowerProfile";
import { InterestMethod, RepaymentFrequency } from "../entities/Loan";
import { CollateralType } from "../entities/LoanCollateral";

export const validateLoanApplication = [
  body("borrower.firstName")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("First name must be between 2 and 100 characters")
    .matches(/^[A-Za-z\s\-'.]+$/)
    .withMessage("First name contains invalid characters"),

  body("borrower.lastName")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Last name must be between 2 and 100 characters")
    .matches(/^[A-Za-z\s\-'.]+$/)
    .withMessage("Last name contains invalid characters"),

  body("borrower.nationalId")
    .trim()
    .isLength({ min: 16, max: 16 })
    .withMessage("National ID must be exactly 16 characters")
    .matches(/^\d{16}$/)
    .withMessage("National ID must contain only numbers"),

  body("borrower.gender")
    .isIn(Object.values(Gender))
    .withMessage(`Gender must be one of: ${Object.values(Gender).join(", ")}`),

  body("borrower.dateOfBirth")
    .isISO8601()
    .withMessage("Date of birth must be a valid date")
    .custom((value) => {
      const birthDate = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 18 || age > 100) {
        throw new Error("Age must be between 18 and 100 years");
      }
      return true;
    }),

  body("borrower.maritalStatus")
    .isIn(Object.values(MaritalStatus))
    .withMessage(`Marital status must be one of: ${Object.values(MaritalStatus).join(", ")}`),

  body("borrower.primaryPhone")
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Primary phone must be a valid phone number"),

  // Loan validation
  body("loan.purposeOfLoan")
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Purpose of loan must be between 5 and 500 characters"),

  body("loan.disbursedAmount")
    .isFloat({ min: 1000, max: 1000000000 })
    .withMessage("Disbursed amount must be between 1,000 and 1,000,000,000"),

  body("loan.disbursementDate")
    .isISO8601()
    .withMessage("Disbursement date must be a valid date"),

  body("loan.annualInterestRate")
    .isFloat({ min: 0.1, max: 50 })
    .withMessage("Annual interest rate must be between 0.1% and 50%"),

  body("loan.interestMethod")
    .isIn(Object.values(InterestMethod))
    .withMessage(`Interest method must be one of: ${Object.values(InterestMethod).join(", ")}`),

  body("loan.termInMonths")
    .isInt({ min: 1, max: 120 })
    .withMessage("Term in months must be between 1 and 120 months"),

  body("loan.repaymentFrequency")
    .isIn(Object.values(RepaymentFrequency))
    .withMessage(`Repayment frequency must be one of: ${Object.values(RepaymentFrequency).join(", ")}`),

  // Collateral validation (optional)
  body("collaterals")
    .optional()
    .isArray()
    .withMessage("Collaterals must be an array"),

  body("collaterals.*.collateralType")
    .optional()
    .isIn(Object.values(CollateralType))
    .withMessage(`Collateral type must be one of: ${Object.values(CollateralType).join(", ")}`),

  body("collaterals.*.collateralValue")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Collateral value must be a positive number"),
];