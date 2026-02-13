import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { RepaymentScheduleService } from "../services/repaymentScheduleService";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import { Loan } from "../entities/Loan";
import { RepaymentTransaction } from "../entities/RepaymentTransaction";
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

class RepaymentScheduleController {
  private repaymentScheduleService: RepaymentScheduleService;

  constructor() {
    this.repaymentScheduleService = new RepaymentScheduleService(
      dbConnection.getRepository(RepaymentSchedule),
      dbConnection.getRepository(Loan),
      dbConnection.getRepository(RepaymentTransaction)
    );
  }

  // Get loan repayment schedule
  getLoanRepaymentSchedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
      const limit = parseInt(req.query.limit as string) || 50;

      const result = await this.repaymentScheduleService.getLoanRepaymentSchedule(
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
      console.error("Get loan repayment schedule controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching repayment schedule",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Update schedule after payment
  updateScheduleAfterPayment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
      const loanId = parseInt(req.params.loanId);
      const transactionId = parseInt(req.body.transactionId);

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

      if (!transactionId || isNaN(transactionId)) {
        res.status(400).json({
          success: false,
          message: "Invalid transaction ID",
        });
        return;
      }

      const result = await this.repaymentScheduleService.updateScheduleAfterPayment(
        loanId,
        transactionId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Update schedule after payment controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during schedule update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Recalculate schedule after payment
  recalculateScheduleAfterPayment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const recalculationType = req.body.recalculationType || 'REDUCE_INSTALLMENT';

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

      if (!['REDUCE_INSTALLMENT', 'REDUCE_TERM'].includes(recalculationType)) {
        res.status(400).json({
          success: false,
          message: "Invalid recalculation type. Must be 'REDUCE_INSTALLMENT' or 'REDUCE_TERM'",
        });
        return;
      }

      const result = await this.repaymentScheduleService.recalculateScheduleAfterPayment(
        loanId,
        organizationId,
        recalculationType
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Recalculate schedule after payment controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during schedule recalculation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Adjust future installments
  adjustFutureInstallments = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
      const loanId = parseInt(req.params.loanId);
      const adjustmentType = req.body.adjustmentType || 'PROPORTIONAL';
      const adjustmentAmount = parseFloat(req.body.adjustmentAmount);

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

      if (!['PROPORTIONAL', 'EQUAL_DISTRIBUTION'].includes(adjustmentType)) {
        res.status(400).json({
          success: false,
          message: "Invalid adjustment type. Must be 'PROPORTIONAL' or 'EQUAL_DISTRIBUTION'",
        });
        return;
      }

      if (isNaN(adjustmentAmount)) {
        res.status(400).json({
          success: false,
          message: "Invalid adjustment amount",
        });
        return;
      }

      const result = await this.repaymentScheduleService.adjustFutureInstallments(
        loanId,
        organizationId,
        adjustmentType,
        adjustmentAmount
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Adjust future installments controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during installment adjustment",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Handle partial payments
  handlePartialPayments = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentScheduleService.handlePartialPayments(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Handle partial payments controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while handling partial payments",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Generate remaining schedule
  generateRemainingSchedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const fromDate = req.body.fromDate ? new Date(req.body.fromDate) : new Date();

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

      const result = await this.repaymentScheduleService.generateRemainingSchedule(
        loanId,
        organizationId,
        fromDate
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Generate remaining schedule controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during remaining schedule generation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Calculate due amounts
  calculateDueAmounts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();

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

      const result = await this.repaymentScheduleService.calculateDueAmounts(
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
      console.error("Calculate due amounts controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while calculating due amounts",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Get overdue installments
  getOverdueInstallments = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentScheduleService.getOverdueInstallments(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Get overdue installments controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching overdue installments",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Update days in arrears
  updateDaysInArrears = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentScheduleService.updateDaysInArrears(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Update days in arrears controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while updating days in arrears",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Get next payment due date
  getNextPaymentDueDate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentScheduleService.getNextPaymentDueDate(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Get next payment due date controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching next payment due date",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Scheduled interest accrual
  scheduledInterestAccrual = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.repaymentScheduleService.scheduledInterestAccrual(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Scheduled interest accrual controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during scheduled interest accrual",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Update schedule status
  updateScheduleStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.repaymentScheduleService.updateScheduleStatus(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Update schedule status controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while updating schedule status",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new RepaymentScheduleController();