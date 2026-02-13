import { Router } from "express";
import { body, param, query } from "express-validator";
import AccountController from "../controllers/AccountController";
import TransactionController from "../controllers/TransactionController";
import { authenticate, checkFirstLogin } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";
import { tenantIsolationMiddleware, validateOrganizationOwnership } from "../middleware/tenantIsolation";
import { AccountType } from "../entities/Account";
import { TransactionStatus } from "../entities/Transaction";

const router = Router({ mergeParams: true });

// Apply middleware
router.use(authenticate);
router.use(checkFirstLogin);
router.use(tenantIsolationMiddleware);
router.use(validateOrganizationOwnership);

// ===================================
// ACCOUNT ROUTES
// ===================================

/**
 * POST /organizations/:organizationId/bookkeeping/accounts
 * Create a new account
 */
router.post(
  "/accounts",
  [
    body("accountName")
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Account name must be between 2 and 255 characters"),
    
    body("accountType")
      .isIn(Object.values(AccountType))
      .withMessage(`Account type must be one of: ${Object.values(AccountType).join(", ")}`),
    
    body("accountCategory")
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Account category must be between 2 and 255 characters"),
    

    handleValidationErrors,
  ],
  AccountController.createAccount
);


router.get(
  "/accounts/categories/:type",
  [
    param("type")
      .isIn(Object.values(AccountType))
      .withMessage(`Type must be one of: ${Object.values(AccountType).join(", ")}`),
    
    handleValidationErrors,
  ],
  AccountController.getCategoriesByType
);

/**
 * GET /organizations/:organizationId/bookkeeping/accounts
 * Get all accounts for an organization with filters
 */
router.get(
  "/accounts",
  [
    query("type")
      .optional()
      .isIn(Object.values(AccountType))
      .withMessage(`Type must be one of: ${Object.values(AccountType).join(", ")}`),
    
    query("category")
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage("Category must be max 255 characters"),
    
    query("isActive")
      .optional()
      .isBoolean()
      .withMessage("isActive must be a boolean"),
    
    query("search")
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage("Search term must be max 255 characters"),
    
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    
    handleValidationErrors,
  ],
  AccountController.getAccounts
);

/**
 * GET /organizations/:organizationId/bookkeeping/accounts/:accountId
 * Get a specific account by ID
 */
router.get(
  "/accounts/:accountId",
  [
    param("accountId")
      .isInt({ min: 1 })
      .withMessage("Account ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  AccountController.getAccountById
);

/**
 * PUT /organizations/:organizationId/bookkeeping/accounts/:accountId
 * Update an account
 */
router.put(
  "/accounts/:accountId",
  [
    param("accountId")
      .isInt({ min: 1 })
      .withMessage("Account ID must be a positive integer"),
    
    body("accountName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Account name must be between 2 and 255 characters"),
    
    body("accountCategory")
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage("Account category must be between 2 and 255 characters"),
    
    body("isActive")
      .optional()
      .isBoolean()
      .withMessage("isActive must be a boolean"),
    
    handleValidationErrors,
  ],
  AccountController.updateAccount
);

/**
 * DELETE /organizations/:organizationId/bookkeeping/accounts/:accountId
 * Delete an account (soft delete if has transactions)
 */
router.delete(
  "/accounts/:accountId",
  [
    param("accountId")
      .isInt({ min: 1 })
      .withMessage("Account ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  AccountController.deleteAccount
);

/**
 * GET /organizations/:organizationId/bookkeeping/accounts/:accountId/balance
 * Get account balance
 */
router.get(
  "/accounts/:accountId/balance",
  [
    param("accountId")
      .isInt({ min: 1 })
      .withMessage("Account ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  AccountController.getAccountBalance
);

/**
 * GET /organizations/:organizationId/bookkeeping/accounts/by-type/:type
 * Get accounts by type
 */
router.get(
  "/accounts/by-type/:type",
  [
    param("type")
      .isIn(Object.values(AccountType))
      .withMessage(`Type must be one of: ${Object.values(AccountType).join(", ")}`),
    
    handleValidationErrors,
  ],
  AccountController.getAccountsByType
);

// ===================================
// TRANSACTION ROUTES
// ===================================

/**
 * POST /organizations/:organizationId/bookkeeping/transactions
 * Create a new transaction
 */
router.post(
  "/transactions",
  [
    body("transactionDate")
      .optional()
      .isISO8601()
      .withMessage("Transaction date must be a valid ISO 8601 date"),
    
    body("description")
      .trim()
      .isLength({ min: 5, max: 2000 })
      .withMessage("Description must be between 5 and 2000 characters"),
    
    // Simple transaction fields (optional if split transaction)
    body("debitAccountId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Debit account ID must be a positive integer"),
    
    body("creditAccountId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Credit account ID must be a positive integer"),
    
    body("amount")
      .optional()
      .isFloat({ min: 0.01, max: 9999999999999.99 })
      .withMessage("Amount must be between 0.01 and 9,999,999,999,999.99"),
    
    // Split transaction fields
    body("debitLines")
      .optional()
      .isArray()
      .withMessage("Debit lines must be an array"),
    
    body("debitLines.*.accountId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Each debit line must have a valid account ID"),
    
    body("debitLines.*.amount")
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage("Each debit line amount must be greater than 0.01"),
    
    body("creditLines")
      .optional()
      .isArray()
      .withMessage("Credit lines must be an array"),
    
    body("creditLines.*.accountId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Each credit line must have a valid account ID"),
    
    body("creditLines.*.amount")
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage("Each credit line amount must be greater than 0.01"),
    
    // VAT fields
    body("isVATApplied")
      .isBoolean()
      .withMessage("isVATApplied must be a boolean"),
    
    body("referenceNumber")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Reference number must be max 100 characters"),
    
    body("vatRate")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("VAT rate must be between 0 and 100"),
    
    body("vatTransactionType")
      .optional()
      .isIn(["revenue", "expense"])
      .withMessage("VAT transaction type must be either 'revenue' or 'expense'"),
    
    // Custom validation to ensure either simple or split transaction data is provided
    body().custom((value, { req }) => {
      const { debitAccountId, creditAccountId, amount, debitLines, creditLines } = req.body;
      
      const isSimpleTransaction = debitAccountId && creditAccountId && amount;
      const isSplitDebitTransaction = debitLines && debitLines.length > 0 && creditAccountId;
      const isSplitCreditTransaction = creditLines && creditLines.length > 0 && debitAccountId;
      
      if (!isSimpleTransaction && !isSplitDebitTransaction && !isSplitCreditTransaction) {
        throw new Error(
          "Transaction must be either: " +
          "(1) Simple: debitAccountId, creditAccountId, and amount, " +
          "(2) Split Debit: debitLines array and creditAccountId, or " +
          "(3) Split Credit: creditLines array and debitAccountId"
        );
      }
      
      return true;
    }),
    
    handleValidationErrors,
  ],
  TransactionController.createTransaction
);

/**
 * GET /organizations/:organizationId/bookkeeping/transactions
 * Get all transactions with filters
 */
router.get(
  "/transactions",
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be a valid ISO 8601 date"),
    
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be a valid ISO 8601 date"),
    
    query("accountId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Account ID must be a positive integer"),
    
    query("status")
      .optional()
      .isIn(Object.values(TransactionStatus))
      .withMessage(`Status must be one of: ${Object.values(TransactionStatus).join(", ")}`),
    
    query("isVATApplied")
      .optional()
      .isBoolean()
      .withMessage("isVATApplied must be a boolean"),
    
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    
    handleValidationErrors,
  ],
  TransactionController.getTransactions
);

/**
 * GET /organizations/:organizationId/bookkeeping/transactions/:transactionId
 * Get a specific transaction by ID
 */
router.get(
  "/transactions/:transactionId",
  [
    param("transactionId")
      .isInt({ min: 1 })
      .withMessage("Transaction ID must be a positive integer"),
    
    handleValidationErrors,
  ],
  TransactionController.getTransactionById
);

/**
 * POST /organizations/:organizationId/bookkeeping/transactions/:transactionId/reverse
 * Reverse a transaction
 */
router.post(
  "/transactions/:transactionId/reverse",
  [
    param("transactionId")
      .isInt({ min: 1 })
      .withMessage("Transaction ID must be a positive integer"),
    
    body("reason")
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage("Reversal reason must be between 10 and 500 characters"),
    
    handleValidationErrors,
  ],
  TransactionController.reverseTransaction
);

export default router;