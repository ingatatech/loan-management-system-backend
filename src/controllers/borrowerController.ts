// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { BorrowerService, } from "../services/borrowerService";
import { BorrowerProfileData, ExtendedBorrowerData } from "../entities/BorrowerProfile";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import { Organization } from "../entities/Organization";
import dbConnection from "../db";
import { parseISO, isValid } from 'date-fns';

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

class BorrowerController {
  private borrowerService: BorrowerService;

  constructor() {
    this.borrowerService = new BorrowerService(
      dbConnection.getRepository(BorrowerProfile),
      dbConnection.getRepository(Organization)
    );
  }
  getBorrowerProfiles = async (
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

      // Parse query parameters (maintains original pattern)
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const isActive = req.query.isActive === "true" 
        ? true 
        : req.query.isActive === "false" 
        ? false 
        : undefined;

      const result = await this.borrowerService.getBorrowerProfiles(
        organizationId,
        page,
        limit,
        search,
        isActive
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get borrower profiles controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching borrower profiles",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Create Borrower Profile
   * POST /api/organizations/:organizationId/borrowers
   * Maintains 100% original functionality with enhanced validation
   */
  createBorrowerProfile = async (
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

      // Parse and validate dateOfBirth (original code functionality)
      let dateOfBirth: Date;
      try {
        dateOfBirth = parseISO(req.body.dateOfBirth);
        if (!isValid(dateOfBirth)) {
          throw new Error('Invalid date format');
        }
      } catch (error) {
        res.status(400).json({
          success: false,
          message: "Invalid date format for dateOfBirth. Please use YYYY-MM-DD format.",
        });
        return;
      }

      // Build borrower data object (maintains original structure)
      const borrowerData: BorrowerProfileData = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        middleName: req.body.middleName,
        nationalId: req.body.nationalId,
        gender: req.body.gender,
        dateOfBirth: dateOfBirth,
        maritalStatus: req.body.maritalStatus,
        primaryPhone: req.body.primaryPhone,
        alternativePhone: req.body.alternativePhone,
        email: req.body.email,
        address: req.body.address,
        occupation: req.body.occupation,
        monthlyIncome: req.body.monthlyIncome,
        incomeSource: req.body.incomeSource,
        relationshipWithNDFSP: req.body.relationshipWithNDFSP,
        previousLoansPaidOnTime: req.body.previousLoansPaidOnTime,
        notes: req.body.notes,
      };

      // Call service layer (maintains original pattern)
      const result = await this.borrowerService.createBorrowerProfile(
        borrowerData,
        organizationId
      );

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Create borrower profile controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during borrower profile creation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get Borrower Profiles with Pagination
   * GET /api/organizations/:organizationId/borrowers
   * Maintains 100% original functionality with enhanced filtering
   */

    extendBorrowerProfile = async (
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
      const borrowerId = parseInt(req.params.borrowerId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!borrowerId || isNaN(borrowerId)) {
        res.status(400).json({
          success: false,
          message: "Invalid borrower ID",
        });
        return;
      }

      // Parse date fields if present
      const extendedData: ExtendedBorrowerData = { ...req.body };

      // Handle date fields
      const dateFields = ['dateOpened', 'dateClosed', 'lastPaymentDate', 
                         'firstPaymentDate', 'approvalDate', 'finalPaymentDate'];
      
      for (const field of dateFields) {
        if (req.body[field]) {
          try {
            const parsedDate = parseISO(req.body[field]);
            if (isValid(parsedDate)) {
              extendedData[field] = parsedDate;
            }
          } catch (error) {
            console.warn(`Invalid date format for ${field}`);
          }
        }
      }

      // Call service layer to extend borrower
      const result = await this.borrowerService.extendBorrowerProfile(
        borrowerId,
        organizationId,
        extendedData
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Extend borrower profile controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during borrower profile extension",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
  

  /**
   * Get Borrower by ID
   * GET /api/organizations/:organizationId/borrowers/:borrowerId
   * Maintains 100% original functionality
   */
  getBorrowerById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const borrowerId = parseInt(req.params.borrowerId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!borrowerId || isNaN(borrowerId)) {
        res.status(400).json({
          success: false,
          message: "Invalid borrower ID",
        });
        return;
      }

      const result = await this.borrowerService.getBorrowerById(
        borrowerId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get borrower by ID controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching borrower profile",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Update Borrower Profile
   * PUT /api/organizations/:organizationId/borrowers/:borrowerId
   * Maintains 100% original functionality with enhanced validation
   */
  updateBorrowerProfile = async (
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
      const borrowerId = parseInt(req.params.borrowerId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!borrowerId || isNaN(borrowerId)) {
        res.status(400).json({
          success: false,
          message: "Invalid borrower ID",
        });
        return;
      }

      const updateData: Partial<BorrowerProfileData> = req.body;

      // Convert dateOfBirth to Date if provided (maintains original logic)
      if (updateData.dateOfBirth) {
        try {
          const parsedDate = new Date(updateData.dateOfBirth as any);
          if (isNaN(parsedDate.getTime())) {
            res.status(400).json({
              success: false,
              message: "Invalid date format for dateOfBirth. Please use YYYY-MM-DD format.",
            });
            return;
          }
          updateData.dateOfBirth = parsedDate;
        } catch (error) {
          res.status(400).json({
            success: false,
            message: "Invalid date format for dateOfBirth. Please use YYYY-MM-DD format.",
          });
          return;
        }
      }

      const result = await this.borrowerService.updateBorrowerProfile(
        borrowerId,
        updateData,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Borrower profile not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Update borrower profile controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during borrower profile update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Delete Borrower Profile (Permanent)
   * DELETE /api/organizations/:organizationId/borrowers/:borrowerId
   * Maintains 100% original functionality
   */
  deleteBorrowerProfile = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const borrowerId = parseInt(req.params.borrowerId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!borrowerId || isNaN(borrowerId)) {
        res.status(400).json({
          success: false,
          message: "Invalid borrower ID",
        });
        return;
      }

      const result = await this.borrowerService.permanentDeleteBorrowerProfile(
        borrowerId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Borrower profile not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Permanent delete borrower profile controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during permanent borrower profile deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get Borrower Statistics
   * GET /api/organizations/:organizationId/borrowers/:borrowerId/stats
   * Maintains 100% original functionality
   */
  getBorrowerStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const borrowerId = parseInt(req.params.borrowerId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!borrowerId || isNaN(borrowerId)) {
        res.status(400).json({
          success: false,
          message: "Invalid borrower ID",
        });
        return;
      }

      const result = await this.borrowerService.getBorrowerById(
        borrowerId,
        organizationId
      );

      if (!result.success || !result.data) {
        res.status(404).json({
          success: false,
          message: "Borrower profile not found",
        });
        return;
      }

      const borrower = result.data as BorrowerProfile;

      // Calculate statistics (maintains original logic)
      const stats = {
        totalLoans: borrower.loans?.length || 0,
        activeLoans: borrower.loans?.filter(
          loan => loan.isActive && loan.status !== "closed"
        ).length || 0,
        totalDisbursed: borrower.loans?.reduce(
          (sum, loan) => sum + (loan.disbursedAmount || 0), 
          0
        ) || 0,
        totalOutstanding: borrower.loans?.reduce(
          (sum, loan) => sum + (loan.outstandingPrincipal || 0), 
          0
        ) || 0,
        totalPaid: borrower.loans?.reduce(
          (sum, loan) => sum + (loan.totalPaidAmount || 0), 
          0
        ) || 0,
        creditScore: borrower.getCreditScore(),
        isEligibleForLoan: borrower.isEligibleForLoan(),
        riskLevel: this.calculateRiskLevel(borrower),
        lastLoanDate: this.getLastLoanDate(borrower.loans || []),
        repaymentHistory: {
          onTime: borrower.previousLoansPaidOnTime,
          total: borrower.loans?.length || 0,
          percentage: borrower.loans?.length 
            ? (borrower.previousLoansPaidOnTime / borrower.loans.length) * 100 
            : 0,
        },
      };

      res.status(200).json({
        success: true,
        message: "Borrower statistics retrieved successfully",
        data: {
          borrower: borrower,
          statistics: stats,
        },
      });
    } catch (error: any) {
      console.error("Get borrower stats controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching borrower statistics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Private helper methods (maintains original logic)
  private calculateRiskLevel(borrower: BorrowerProfile): string {
    const creditScore = borrower.getCreditScore();
    const age = borrower.age;
    const hasIncome = !!borrower.monthlyIncome;
    
    let riskScore = 0;
    
    if (creditScore >= 750) riskScore += 3;
    else if (creditScore >= 650) riskScore += 2;
    else if (creditScore >= 550) riskScore += 1;
    
    if (age >= 25 && age <= 55) riskScore += 2;
    else if (age >= 18 && age <= 65) riskScore += 1;
    
    if (hasIncome) riskScore += 1;
    
    if (borrower.previousLoansPaidOnTime > 2) riskScore += 2;
    else if (borrower.previousLoansPaidOnTime > 0) riskScore += 1;
    
    if (riskScore >= 7) return "Low";
    if (riskScore >= 4) return "Medium";
    return "High";
  }

  private getLastLoanDate(loans: any[]): Date | null {
    if (!loans || loans.length === 0) return null;
    
    const sortedLoans = loans.sort((a, b) => 
      new Date(b.disbursementDate).getTime() - new Date(a.disbursementDate).getTime()
    );
    
    return sortedLoans[0]?.disbursementDate || null;
  }
}

export default new BorrowerController();