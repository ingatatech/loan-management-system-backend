// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { LoanService, LoanData, CollateralData } from "../services/loanService";
import { Loan, LoanStatus } from "../entities/Loan";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import { Organization } from "../entities/Organization";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import { LoanCollateral } from "../entities/LoanCollateral";
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

class LoanController {
  private loanService: LoanService;

  constructor() {
    this.loanService = new LoanService(
      dbConnection.getRepository(Loan),
      dbConnection.getRepository(BorrowerProfile),
      dbConnection.getRepository(Organization),
      dbConnection.getRepository(RepaymentSchedule),
      dbConnection.getRepository(LoanCollateral)
    );
  }

  createLoan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const loanData: LoanData = {
        borrowerId: req.body.borrowerId,
        purposeOfLoan: req.body.purposeOfLoan,
        branchName: req.body.branchName,
        loanOfficer: req.body.loanOfficer,
        disbursedAmount: req.body.disbursedAmount,
        disbursementDate: new Date(req.body.disbursementDate),
        annualInterestRate: req.body.annualInterestRate,
        interestMethod: req.body.interestMethod,
        termInMonths: req.body.termInMonths,
        repaymentFrequency: req.body.repaymentFrequency,
        gracePeriodMonths: req.body.gracePeriodMonths,
        notes: req.body.notes,
      };

      const collaterals: CollateralData[] = req.body.collaterals || [];

      const result = await this.loanService.createLoan(loanData, organizationId, collaterals);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Create loan controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan creation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getLoans = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as LoanStatus;
      const borrowerId = req.query.borrowerId ? parseInt(req.query.borrowerId as string) : undefined;

      const result = await this.loanService.getLoans(
        organizationId,
        page,
        limit,
        search,
        status,
        borrowerId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get loans controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loans",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getLoanById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.loanService.getLoanById(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan by ID controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  updateLoan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const updateData: Partial<LoanData> = req.body;

      // Convert dates if provided
      if (updateData.disbursementDate) {
        updateData.disbursementDate = new Date(updateData.disbursementDate as any);
      }

      const result = await this.loanService.updateLoan(loanId, updateData, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Loan not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Update loan controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  approveLoan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.loanService.approveLoan(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Loan not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Approve loan controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan approval",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  disburseLoan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const disbursementDate = req.body.disbursementDate ? new Date(req.body.disbursementDate) : undefined;

      const result = await this.loanService.disburseLoan(loanId, organizationId, disbursementDate);

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Loan not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Disburse loan controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan disbursement",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  addCollateral = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const collateralData: CollateralData = {
        collateralType: req.body.collateralType,
        description: req.body.description,
        collateralValue: req.body.collateralValue,
        guarantorName: req.body.guarantorName,
        guarantorPhone: req.body.guarantorPhone,
        guarantorAddress: req.body.guarantorAddress,
        proofOfOwnershipUrl: req.body.proofOfOwnershipUrl,
        proofOfOwnershipType: req.body.proofOfOwnershipType,
        additionalDocumentsUrls: req.body.additionalDocumentsUrls,
        valuationDate: req.body.valuationDate ? new Date(req.body.valuationDate) : undefined,
        valuedBy: req.body.valuedBy,
        notes: req.body.notes,
      };

      const result = await this.loanService.addCollateral(loanId, collateralData);

      if (result.success) {
        res.status(201).json(result);
      } else {
        const statusCode = result.message === "Loan not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Add collateral controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during collateral addition",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getLoanStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

      const result = await this.loanService.getLoanById(loanId, organizationId);

      if (!result.success || !result.data) {
        res.status(404).json({
          success: false,
          message: "Loan not found",
        });
        return;
      }

      const loan = result.data as Loan;

      // Calculate loan statistics
      const stats = {
        loanAmount: loan.disbursedAmount,
        totalInterest: loan.totalInterestAmount,
        totalRepayable: loan.totalAmountToBeRepaid,
        monthlyInstallment: loan.monthlyInstallmentAmount,
        outstandingPrincipal: loan.outstandingPrincipal,
        accruedInterest: loan.accruedInterestToDate,
        remainingBalance: loan.remainingBalance,
        totalPaid: loan.totalPaidAmount,
        totalPrincipalPaid: loan.totalPrincipalPaid,
        totalInterestPaid: loan.totalInterestPaid,
        daysInArrears: loan.daysInArrears,
        totalCollateralValue: loan.totalCollateralValue,
        loanToValueRatio: loan.loanToValueRatio,
        classification: loan.getClassificationCategory(),
        provisioningRate: loan.getProvisioningRate(),
        netExposure: loan.calculateNetExposure(),
        provisionRequired: loan.calculateProvisionRequired(),
        isOverdue: loan.isOverdue(),
        isPerforming: loan.isPerforming(),
        progress: {
          percentagePaid: loan.totalAmountToBeRepaid > 0 ? (loan.totalPaidAmount / loan.totalAmountToBeRepaid) * 100 : 0,
          principalProgress: loan.disbursedAmount > 0 ? (loan.totalPrincipalPaid / loan.disbursedAmount) * 100 : 0,
          timeProgress: this.calculateTimeProgress(loan),
        },
        riskAssessment: this.calculateRiskLevel(loan),
        nextPaymentDate: this.getNextPaymentDate(loan),
        maturityStatus: this.getMaturityStatus(loan),
      };

      res.status(200).json({
        success: true,
        message: "Loan statistics retrieved successfully",
        data: {
          loan: loan,
          statistics: stats,
        },
      });
    } catch (error: any) {
      console.error("Get loan stats controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan statistics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getLoanClassificationReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Get all loans for the organization
      const loansResult = await this.loanService.getLoans(organizationId, 1, 1000); // Get all loans

      if (!loansResult.success || !loansResult.data) {
        res.status(500).json({
          success: false,
          message: "Failed to retrieve loans for classification",
        });
        return;
      }

      const loans = loansResult.data as Loan[];

      // Generate classification report
      const classificationReport = {
        reportDate: new Date(),
        organizationId,
        totalLoans: loans.length,
        classifications: {
          normal: loans.filter(loan => loan.daysInArrears <= 30),
          watch: loans.filter(loan => loan.daysInArrears > 30 && loan.daysInArrears <= 90),
          substandard: loans.filter(loan => loan.daysInArrears > 90 && loan.daysInArrears <= 180),
          doubtful: loans.filter(loan => loan.daysInArrears > 180 && loan.daysInArrears <= 365),
          loss: loans.filter(loan => loan.daysInArrears > 365),
        },
        summary: {
          totalOutstanding: loans.reduce((sum, loan) => sum + loan.outstandingPrincipal, 0),
          totalCollateralValue: loans.reduce((sum, loan) => sum + loan.totalCollateralValue, 0),
          totalNetExposure: loans.reduce((sum, loan) => sum + loan.calculateNetExposure(), 0),
          totalProvisionRequired: loans.reduce((sum, loan) => sum + loan.calculateProvisionRequired(), 0),
        },
      };

      // Add percentage calculations
      const enrichedReport = {
        ...classificationReport,
        percentages: {
          normal: (classificationReport.classifications.normal.length / classificationReport.totalLoans) * 100,
          watch: (classificationReport.classifications.watch.length / classificationReport.totalLoans) * 100,
          substandard: (classificationReport.classifications.substandard.length / classificationReport.totalLoans) * 100,
          doubtful: (classificationReport.classifications.doubtful.length / classificationReport.totalLoans) * 100,
          loss: (classificationReport.classifications.loss.length / classificationReport.totalLoans) * 100,
        },
      };

      res.status(200).json({
        success: true,
        message: "Loan classification report generated successfully",
        data: enrichedReport,
      });
    } catch (error: any) {
      console.error("Get loan classification report controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating classification report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Private helper methods
  private calculateTimeProgress(loan: Loan): number {
    const startDate = new Date(loan.disbursementDate);
    const endDate = new Date(loan.agreedMaturityDate);
    const currentDate = new Date();

    const totalTime = endDate.getTime() - startDate.getTime();
    const elapsedTime = currentDate.getTime() - startDate.getTime();

    if (totalTime <= 0) return 100;
    return Math.max(0, Math.min(100, (elapsedTime / totalTime) * 100));
  }

  private calculateRiskLevel(loan: Loan): string {
    let riskScore = 0;

    // Days in arrears factor
    if (loan.daysInArrears === 0) riskScore += 3;
    else if (loan.daysInArrears <= 30) riskScore += 2;
    else if (loan.daysInArrears <= 90) riskScore += 1;

    // Collateral coverage factor
    const coverageRatio = loan.loanToValueRatio;
    if (coverageRatio <= 80) riskScore += 3;
    else if (coverageRatio <= 100) riskScore += 2;
    else if (coverageRatio <= 120) riskScore += 1;

    // Payment history factor (based on classification)
    const classification = loan.getClassificationCategory();
    if (classification === "Normal/Standard") riskScore += 2;
    else if (classification === "Watch") riskScore += 1;

    if (riskScore >= 7) return "Low";
    if (riskScore >= 4) return "Medium";
    return "High";
  }

  private getNextPaymentDate(loan: Loan): Date | null {
    // This would typically come from the repayment schedule
    // For now, we'll calculate it based on repayment frequency
    const lastPaymentDate = new Date(loan.disbursementDate);
    const frequency = loan.repaymentFrequency;

    // Add logic to find actual next payment date from schedule
    return lastPaymentDate; // Simplified for now
  }

  private getMaturityStatus(loan: Loan): string {
    const today = new Date();
    const maturityDate = new Date(loan.agreedMaturityDate);
    const daysToMaturity = Math.ceil((maturityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysToMaturity < 0) return "Overdue";
    if (daysToMaturity <= 30) return "Due Soon";
    if (daysToMaturity <= 90) return "Approaching Maturity";
    return "Current";
  }
}

export default new LoanController();