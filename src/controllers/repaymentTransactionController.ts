import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { RepaymentTransactionService } from "../services/repaymentTransactionService";
import { RepaymentTransaction } from "../entities/RepaymentTransaction";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import { Loan } from "../entities/Loan";
import dbConnection from "../db";

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

class RepaymentTransactionController {
  private repaymentTransactionService: RepaymentTransactionService;

  constructor() {
    this.repaymentTransactionService = new RepaymentTransactionService(
      dbConnection.getRepository(RepaymentTransaction),
      dbConnection.getRepository(RepaymentSchedule),
      dbConnection.getRepository(Loan)
    );
  }

  processPayment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // ── Validation ──────────────────────────────────────────────────────────
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
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const {
        amountPaid,
        paymentDate,
        paymentMethod,
        repaymentProof,
        receivedBy,
        approvedBy,
        notes,
        targetInstallmentId, // optional: installment-specific payment
      } = req.body;

      const createdBy = req.user?.id || null;

      // ── Delegate to service ──────────────────────────────────────────────────
      const result = await this.repaymentTransactionService.processPayment(
        loanId,
        {
          amountPaid: parseFloat(amountPaid),
          paymentDate: new Date(paymentDate),
          paymentMethod,
          repaymentProof: repaymentProof || undefined,
          receivedBy: receivedBy || undefined,
          approvedBy: approvedBy || undefined,
          notes: notes || undefined,
        },
        organizationId,
        createdBy
      );

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while processing payment",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Daily delayed days update endpoint
  performDailyDelayedDaysUpdate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }


      const result = await this.repaymentTransactionService.performDailyDelayedDaysUpdate(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error during daily delayed days update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Get delayed days report for organization
  getDelayedDaysReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const daysThreshold = parseInt(req.query.daysThreshold as string) || 0;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Get all schedules with delayed days above threshold
      const schedules = await dbConnection.getRepository(RepaymentSchedule)
        .createQueryBuilder('schedule')
        .leftJoinAndSelect('schedule.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere('schedule.delayedDays >= :threshold', { threshold: daysThreshold })
        .orderBy('schedule.delayedDays', 'DESC')
        .getMany();

      // Group by loan for summary
      const loanSummary = schedules.reduce((acc, schedule) => {
        const loanId = schedule.loan.loanId;
        if (!acc[loanId]) {
          acc[loanId] = {
            loanId: schedule.loan.loanId,
            borrowerName: schedule.loan.borrower?.fullName || 'N/A',
            maxDelayedDays: 0,
            totalDelayedDays: 0,
            installmentsWithDelays: 0,
            schedules: []
          };
        }
        
        acc[loanId].maxDelayedDays = Math.max(acc[loanId].maxDelayedDays, schedule.delayedDays);
        acc[loanId].totalDelayedDays += schedule.delayedDays;
        acc[loanId].installmentsWithDelays++;
        acc[loanId].schedules.push({
          installmentNumber: schedule.installmentNumber,
          dueDate: schedule.dueDate,
          delayedDays: schedule.delayedDays,
          actualPaymentDate: schedule.actualPaymentDate,
          status: schedule.status
        });
        
        return acc;
      }, {} as any);

      const reportData = Object.values(loanSummary);
      const totalLoansWithDelays = reportData.length;
      const totalDelayedDays = reportData.reduce((sum: number, loan: any) => sum + loan.totalDelayedDays, 0);

      res.status(200).json({
        success: true,
        message: `Delayed days report generated for ${totalLoansWithDelays} loans`,
        data: {
          reportSummary: {
            totalLoansWithDelays,
            totalDelayedDays,
            averageDelayedDaysPerLoan: totalLoansWithDelays > 0 ? Math.round(totalDelayedDays / totalLoansWithDelays * 100) / 100 : 0,
            daysThreshold,
            reportDate: new Date()
          },
          loanDetails: reportData
        }
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while generating delayed days report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Enhanced get payment summary with delayed days
  getPaymentSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.repaymentTransactionService.getPaymentSummary(
        loanId,
        organizationId
      );

      if (result.success) {

        
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching enhanced payment summary",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // All existing methods remain unchanged for backward compatibility
  getLoanTransactions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.repaymentTransactionService.getLoanTransactions(
        loanId,
        organizationId,
        page,
        limit
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan transactions",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getTransactionById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentTransactionService.getTransactionById(
        transactionId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching transaction",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  reverseTransaction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentTransactionService.reverseTransaction(
        transactionId,
        organizationId,
        req.body.reason,
        req.user?.id || null
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error during transaction reversal",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  generatePaymentReceipt = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentTransactionService.generatePaymentReceipt(
        transactionId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while generating receipt",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  calculateAccruedInterest = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();

      const result = await this.repaymentTransactionService.calculateAccruedInterest(
        loanId,
        asOfDate,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while calculating accrued interest",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  calculatePenalties = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.repaymentTransactionService.calculatePenalties(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Internal server error while calculating penalties",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new RepaymentTransactionController();
