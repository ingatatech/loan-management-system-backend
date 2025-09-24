import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { TransactionService } from "../services/transactionService";
import { Transaction, TransactionStatus, VATTransactionType } from "../entities/Transaction";
import { TransactionLine } from "../entities/TransactionLine";
import { Account } from "../entities/Account";
import { VATConfiguration } from "../entities/VATConfiguration";
import { Organization } from "../entities/Organization";
import dbConnection from "../db";
import { parseISO, isValid } from "date-fns";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
  organizationId?: number;
}

class TransactionController {
  private transactionService: TransactionService;

  constructor() {
    this.transactionService = new TransactionService(
      dbConnection.getRepository(Transaction),
      dbConnection.getRepository(TransactionLine),
      dbConnection.getRepository(Account),
      dbConnection.getRepository(VATConfiguration),
      dbConnection.getRepository(Organization)
    );
  }

  createTransaction = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Parse transaction date
      let transactionDate: Date;
      if (req.body.transactionDate) {
        transactionDate = parseISO(req.body.transactionDate);
        if (!isValid(transactionDate)) {
          res.status(400).json({
            success: false,
            message: "Invalid transaction date format",
          });
          return;
        }
      } else {
        transactionDate = new Date();
      }

      // Build transaction data object based on transaction type
      const transactionData: any = {
        transactionDate,
        description: req.body.description,
        isVATApplied: req.body.isVATApplied === true || req.body.isVATApplied === "true",
        referenceNumber: req.body.referenceNumber,
      };

      // Add VAT fields if applicable
      if (transactionData.isVATApplied) {
        transactionData.vatRate = req.body.vatRate ? parseFloat(req.body.vatRate) : undefined;
        transactionData.vatTransactionType = req.body.vatTransactionType as VATTransactionType;
      }

      // Determine transaction type and add appropriate fields
      const hasDebitLines = req.body.debitLines && Array.isArray(req.body.debitLines) && req.body.debitLines.length > 0;
      const hasCreditLines = req.body.creditLines && Array.isArray(req.body.creditLines) && req.body.creditLines.length > 0;

      if (hasDebitLines) {
        // Split Debit Transaction: Multiple debit lines + single credit account
        transactionData.debitLines = req.body.debitLines.map((line: any) => ({
          accountId: parseInt(line.accountId),
          amount: parseFloat(line.amount),
          description: line.description || req.body.description
        }));
        transactionData.creditAccountId = parseInt(req.body.creditAccountId);

        console.log("Split Debit Transaction Detected:", {
          debitLines: transactionData.debitLines,
          creditAccountId: transactionData.creditAccountId
        });
      } else if (hasCreditLines) {
        // Split Credit Transaction: Single debit account + multiple credit lines
        transactionData.creditLines = req.body.creditLines.map((line: any) => ({
          accountId: parseInt(line.accountId),
          amount: parseFloat(line.amount),
          description: line.description || req.body.description
        }));
        transactionData.debitAccountId = parseInt(req.body.debitAccountId);

        console.log("Split Credit Transaction Detected:", {
          debitAccountId: transactionData.debitAccountId,
          creditLines: transactionData.creditLines
        });
      } else {
        // Simple Transaction: Single debit + single credit
        transactionData.debitAccountId = parseInt(req.body.debitAccountId);
        transactionData.creditAccountId = parseInt(req.body.creditAccountId);
        transactionData.amount = parseFloat(req.body.amount);

        console.log("Simple Transaction Detected:", {
          debitAccountId: transactionData.debitAccountId,
          creditAccountId: transactionData.creditAccountId,
          amount: transactionData.amount
        });
      }

      console.log("Final Transaction Data being sent to service:", JSON.stringify(transactionData, null, 2));

      const result = await this.transactionService.createTransaction(
        transactionData,
        organizationId,
        req.user?.id || 0
      );

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Create transaction controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getTransactions = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const filters: any = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      if (req.query.startDate) {
        filters.startDate = parseISO(req.query.startDate as string);
      }

      if (req.query.endDate) {
        filters.endDate = parseISO(req.query.endDate as string);
      }

      if (req.query.accountId) {
        filters.accountId = parseInt(req.query.accountId as string);
      }

      if (req.query.status) {
        filters.status = req.query.status as TransactionStatus;
      }

      if (req.query.isVATApplied) {
        filters.isVATApplied = req.query.isVATApplied === "true";
      }

      const result = await this.transactionService.getTransactions(
        organizationId,
        filters
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Get transactions controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getTransactionById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const transactionId = parseInt(req.params.transactionId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!transactionId || isNaN(transactionId)) {
        res.status(400).json({
          success: false,
          message: "Invalid transaction ID",
        });
        return;
      }

      const result = await this.transactionService.getTransactionById(
        transactionId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get transaction controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  reverseTransaction = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const transactionId = parseInt(req.params.transactionId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!transactionId || isNaN(transactionId)) {
        res.status(400).json({
          success: false,
          message: "Invalid transaction ID",
        });
        return;
      }

      const reason = req.body.reason;

      if (!reason || reason.trim().length < 10) {
        res.status(400).json({
          success: false,
          message: "Reversal reason must be at least 10 characters",
        });
        return;
      }

      const result = await this.transactionService.reverseTransaction(
        transactionId,
        reason,
        organizationId,
        req.user?.id || 0
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Reverse transaction controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new TransactionController();