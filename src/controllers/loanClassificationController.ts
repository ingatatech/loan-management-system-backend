// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { LoanClassificationService, ServiceResponse } from "../services/loanClassificationService";
import { LoanClassification, LoanClass } from "../entities/LoanClassification";
import { Loan } from "../entities/Loan";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import dbConnection from "../db";
import { ClassificationSnapshot } from "../entities/ClassificationSnapshot";

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

class LoanClassificationController {
    private loanClassificationService: LoanClassificationService;

    constructor() {
        this.loanClassificationService = new LoanClassificationService(
            dbConnection.getRepository(LoanClassification),
            dbConnection.getRepository(Loan),
            dbConnection.getRepository(RepaymentSchedule)
        );
    }

    // Calculate days in arrears
    calculateDaysInArrears = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

            const result = await this.loanClassificationService.calculateDaysInArrears(
                loanId,
                organizationId
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Calculate days in arrears controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while calculating days in arrears",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Update loan status
    updateLoanStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

            const result = await this.loanClassificationService.updateLoanStatus(
                loanId,
                organizationId
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Update loan status controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while updating loan status",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    getClassificationDetailedReport = async (req: AuthenticatedRequest, res: Response) => {
        const { loanClass } = req.params;
        const organizationId = parseInt(req.params.organizationId);
        const startDate = req.query.startDate as string;
        const endDate = req.query.endDate as string;

        const result = await this.loanClassificationService.getClassificationDetailedReport(
            organizationId,
            loanClass as LoanClass,
            { startDate, endDate }
        );

        res.status(200).json(result);
    };
    // Get current outstanding principal
    getCurrentOutstandingPrincipal = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

            const result = await this.loanClassificationService.getCurrentOutstandingPrincipal(
                loanId,
                organizationId
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Get current outstanding principal controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while getting outstanding principal",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Get current accrued interest
    getCurrentAccruedInterest = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

            const result = await this.loanClassificationService.getCurrentAccruedInterest(
                loanId,
                organizationId
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Get current accrued interest controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while getting accrued interest",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Calculate net exposure
    calculateNetExposure = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

            const result = await this.loanClassificationService.calculateNetExposure(
                loanId,
                organizationId
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Calculate net exposure controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while calculating net exposure",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Calculate provision required
    calculateProvisionRequired = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

            const result = await this.loanClassificationService.calculateProvisionRequired(
                loanId,
                organizationId
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Calculate provision required controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while calculating provision required",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Calculate provisions (main function)
    calculateProvisions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

            const result = await this.loanClassificationService.calculateProvisions(
                loanId,
                organizationId
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Calculate provisions controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while calculating provisions",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Create loan classification
    createLoanClassification = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
            const classificationDate = req.body.classificationDate ? new Date(req.body.classificationDate) : new Date();

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

            const result = await this.loanClassificationService.createLoanClassification(
                loanId,
                organizationId,
                classificationDate,
                req.user?.id || null
            );

            if (result.success) {
                res.status(201).json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            console.error("Create loan classification controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while creating loan classification",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };
    // Add this method to LoanClassificationController
    getLoanClassifications = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const organizationId = parseInt(req.params.organizationId);
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;

            if (!organizationId || isNaN(organizationId)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid organization ID",
                });
                return;
            }

            const result = await this.loanClassificationService.getLoanClassifications(
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
            console.error("Get loan classifications controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while fetching loan classifications",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };
    // Generate provisioning report
    generateProvisioningReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const organizationId = parseInt(req.params.organizationId);
            const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();

            if (!organizationId || isNaN(organizationId)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid organization ID",
                });
                return;
            }

            const result = await this.loanClassificationService.generateProvisioningReport(
                organizationId,
                asOfDate
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error: any) {
            console.error("Generate provisioning report controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while generating provisioning report",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };


    // Bulk update loan classifications
    bulkUpdateLoanClassifications = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const organizationId = parseInt(req.params.organizationId);

            if (!organizationId || isNaN(organizationId)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid organization ID",
                });
                return;
            }

            const result = await this.loanClassificationService.bulkUpdateLoanClassifications(
                organizationId,
                req.user?.id || null
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error: any) {
            console.error("Bulk update loan classifications controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error during bulk classification update",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Get loan classification history
    getLoanClassificationHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const organizationId = parseInt(req.params.organizationId);
            const loanId = parseInt(req.params.loanId);
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;

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

            const result = await this.loanClassificationService.getLoanClassificationHistory(
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
            console.error("Get loan classification history controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while fetching classification history",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

    // Get loans by classification
    getLoansByClassification = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const organizationId = parseInt(req.params.organizationId);
            const loanClass = req.params.loanClass as LoanClass;
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;

            if (!organizationId || isNaN(organizationId)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid organization ID",
                });
                return;
            }

            if (!Object.values(LoanClass).includes(loanClass)) {
                res.status(400).json({
                    success: false,
                    message: `Invalid loan class. Must be one of: ${Object.values(LoanClass).join(', ')}`,
                });
                return;
            }

            const result = await this.loanClassificationService.getLoansByClassification(
                organizationId,
                loanClass,
                page,
                limit
            );

            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error: any) {
            console.error("Get loans by classification controller error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error while fetching loans by classification",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };
    // ADD THIS METHOD to the controller class
getPortfolioAtRiskReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const asOfDate = req.query.asOfDate 
      ? new Date(req.query.asOfDate as string) 
      : new Date();

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const result = await this.loanClassificationService.calculatePortfolioAtRisk(
      organizationId,
      asOfDate
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get PAR report controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while generating PAR report",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ADD THESE METHODS to the controller class

getClassificationTrends = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const period = parseInt(req.query.period as string) || 30;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    // This would use the ClassificationSnapshot repository
    const snapshotRepo = dbConnection.getRepository(ClassificationSnapshot);
    
    let query = snapshotRepo
      .createQueryBuilder('snapshot')
      .where('snapshot.organizationId = :organizationId', { organizationId })
      .orderBy('snapshot.snapshotDate', 'DESC')
      .limit(period);

    if (startDate && endDate) {
      query.andWhere('snapshot.snapshotDate BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      });
    }

    const snapshots = await query.getMany();

    const trends = snapshots.map(snapshot => ({
      date: snapshot.snapshotDate,
      totalLoans: snapshot.totalLoans,
      totalPortfolio: snapshot.totalPortfolioValue,
      parRatio: snapshot.totalPARRatio,
      provisionAdequacy: snapshot.provisionAdequacyRatio,
      collateralCoverage: snapshot.collateralCoverageRatio,
      classificationDistribution: snapshot.getClassificationDistribution()
    }));

    res.status(200).json({
      success: true,
      message: "Classification trends retrieved successfully",
      data: {
        trends,
        period: period,
        totalSnapshots: snapshots.length
      }
    });

  } catch (error: any) {
    console.error("Get classification trends controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching classification trends",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

getProvisionGaps = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const threshold = parseFloat(req.query.threshold as string) || 0.8; // 80% adequacy

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const result = await this.loanClassificationService.identifyProvisionGaps(
      organizationId,
      threshold
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get provision gaps controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while identifying provision gaps",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};




async getDailySnapshots(
  organizationId: number,
  dateRange?: { startDate?: string; endDate?: string },
  page: number = 1,
  limit: number = 30
): Promise<ServiceResponse> {
  try {
    const skip = (page - 1) * limit;

    // Get ClassificationSnapshot repository
    const snapshotRepository = dbConnection.getRepository(ClassificationSnapshot);

    let queryBuilder = snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.organizationId = :organizationId', { organizationId });

    // Apply date range filters if provided
    if (dateRange?.startDate) {
      queryBuilder.andWhere('snapshot.snapshotDate >= :startDate', {
        startDate: new Date(dateRange.startDate)
      });
    }
    if (dateRange?.endDate) {
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999); // Include the entire end date
      queryBuilder.andWhere('snapshot.snapshotDate <= :endDate', { endDate });
    }

    // Get snapshots with pagination
    const [snapshots, totalItems] = await queryBuilder
      .orderBy('snapshot.snapshotDate', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Calculate trends and statistics
    const trends = this.calculateSnapshotTrends(snapshots);
    const summary = this.generateSnapshotSummary(snapshots);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      success: true,
      message: `Retrieved ${snapshots.length} daily snapshots`,
      data: {
        snapshots: snapshots.map(snapshot => ({
          id: snapshot.id,
          snapshotDate: snapshot.snapshotDate,
          totalLoans: snapshot.totalLoans,
          totalPortfolioValue: snapshot.totalPortfolioValue,
          totalProvisionsRequired: snapshot.totalProvisionsRequired,
          totalProvisionsHeld: snapshot.totalProvisionsHeld,
          provisionAdequacyRatio: snapshot.provisionAdequacyRatio,
          collateralCoverageRatio: snapshot.collateralCoverageRatio,
          totalPARRatio: snapshot.totalPARRatio,
          loanCountByClass: snapshot.loanCountByClass,
          outstandingByClass: snapshot.outstandingByClass,
          parBreakdown: snapshot.parBreakdown,
          loansWithOverduePayments: snapshot.loansWithOverduePayments,
          averageDaysInArrears: snapshot.averageDaysInArrears,
          // Computed properties
          provisionShortfall: snapshot.getProvisionShortfall ? snapshot.getProvisionShortfall() : 0,
          totalPARAmount: snapshot.getTotalPARAmount ? snapshot.getTotalPARAmount() : 0,
          classificationDistribution: snapshot.getClassificationDistribution ? snapshot.getClassificationDistribution() : {}
        })),
        trends,
        summary,
        dateRange: {
          startDate: dateRange?.startDate || null,
          endDate: dateRange?.endDate || null
        }
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit
      }
    };

  } catch (error: any) {
    console.error("Get daily snapshots error:", error);
    return {
      success: false,
      message: "Failed to retrieve daily snapshots"
    };
  }
}

private calculateSnapshotTrends(snapshots: ClassificationSnapshot[]): any {
  if (snapshots.length < 2) {
    return {
      hasEnoughData: false,
      message: "Insufficient data for trend analysis"
    };
  }

  // Sort by date ascending for trend calculation
  const sortedSnapshots = [...snapshots].sort((a, b) => 
    a.snapshotDate.getTime() - b.snapshotDate.getTime()
  );

  const first = sortedSnapshots[0];
  const last = sortedSnapshots[sortedSnapshots.length - 1];

  const portfolioTrend = last.totalPortfolioValue - first.totalPortfolioValue;
  const portfolioTrendPercentage = first.totalPortfolioValue > 0 
    ? (portfolioTrend / first.totalPortfolioValue) * 100 
    : 0;

  const parTrend = last.totalPARRatio - first.totalPARRatio;
  const adequacyTrend = last.provisionAdequacyRatio - first.provisionAdequacyRatio;
  const coverageTrend = last.collateralCoverageRatio - first.collateralCoverageRatio;

  // Calculate classification trends
  const classificationTrends: any = {};
  const classTypes = ['normal', 'watch', 'substandard', 'doubtful', 'loss'] as const;

  classTypes.forEach(className => {
    const firstCount = first.loanCountByClass[className] || 0;
    const lastCount = last.loanCountByClass[className] || 0;
    const trend = lastCount - firstCount;
    const trendPercentage = firstCount > 0 ? (trend / firstCount) * 100 : (lastCount > 0 ? 100 : 0);

    classificationTrends[className] = {
      trend,
      trendPercentage: Math.round(trendPercentage * 100) / 100,
      direction: trend > 0 ? 'INCREASING' : trend < 0 ? 'DECREASING' : 'STABLE'
    };
  });

  return {
    hasEnoughData: true,
    period: {
      startDate: first.snapshotDate,
      endDate: last.snapshotDate,
      days: Math.ceil((last.snapshotDate.getTime() - first.snapshotDate.getTime()) / (1000 * 60 * 60 * 24))
    },
    portfolio: {
      trend: Math.round(portfolioTrend * 100) / 100,
      trendPercentage: Math.round(portfolioTrendPercentage * 100) / 100,
      direction: portfolioTrend > 0 ? 'GROWING' : portfolioTrend < 0 ? 'SHRINKING' : 'STABLE'
    },
    risk: {
      parTrend: Math.round(parTrend * 100) / 100,
      parDirection: parTrend > 0 ? 'INCREASING' : parTrend < 0 ? 'DECREASING' : 'STABLE',
      adequacyTrend: Math.round(adequacyTrend * 100) / 100,
      adequacyDirection: adequacyTrend > 0 ? 'IMPROVING' : adequacyTrend < 0 ? 'DETERIORATING' : 'STABLE',
      coverageTrend: Math.round(coverageTrend * 100) / 100,
      coverageDirection: coverageTrend > 0 ? 'IMPROVING' : coverageTrend < 0 ? 'DETERIORATING' : 'STABLE'
    },
    classificationTrends,
    // Overall risk assessment
    overallRisk: this.assessOverallRisk(
      parTrend, 
      adequacyTrend, 
      classificationTrends
    )
  };
}

// HELPER METHOD: Generate snapshot summary
private generateSnapshotSummary(snapshots: ClassificationSnapshot[]): any {
  if (snapshots.length === 0) {
    return {
      totalSnapshots: 0,
      message: "No snapshots available for summary"
    };
  }

  const latestSnapshot = snapshots[0]; // Already sorted by date DESC
  const totalPARAmount = latestSnapshot.getTotalPARAmount();

  return {
    totalSnapshots: snapshots.length,
    latestSnapshotDate: latestSnapshot.snapshotDate,
    portfolioSummary: {
      totalLoans: latestSnapshot.totalLoans,
      totalPortfolio: latestSnapshot.totalPortfolioValue,
      averageLoanSize: latestSnapshot.totalLoans > 0 
        ? Math.round(latestSnapshot.totalPortfolioValue / latestSnapshot.totalLoans * 100) / 100 
        : 0
    },
    riskSummary: {
      totalPAR: totalPARAmount,
      parRatio: latestSnapshot.totalPARRatio,
      loansWithOverdue: latestSnapshot.loansWithOverduePayments,
      averageDaysOverdue: latestSnapshot.averageDaysInArrears
    },
    provisioningSummary: {
      required: latestSnapshot.totalProvisionsRequired,
      held: latestSnapshot.totalProvisionsHeld,
      adequacy: latestSnapshot.provisionAdequacyRatio,
      shortfall: latestSnapshot.getProvisionShortfall()
    },
    collateralSummary: {
      totalCollateral: latestSnapshot.totalCollateralValue,
      coverageRatio: latestSnapshot.collateralCoverageRatio
    },
    classificationSummary: latestSnapshot.getClassificationDistribution()
  };
}

// HELPER METHOD: Assess overall risk based on trends
private assessOverallRisk(
  parTrend: number,
  adequacyTrend: number,
  classificationTrends: any
): string {
  const riskFactors: string[] = [];

  if (parTrend > 1) riskFactors.push("PAR increasing");
  if (adequacyTrend < -5) riskFactors.push("Provision adequacy declining");
  
  // Check if riskier classifications are increasing
  if (classificationTrends.watch.trend > 0) riskFactors.push("Watch loans increasing");
  if (classificationTrends.substandard.trend > 0) riskFactors.push("Substandard loans increasing");
  if (classificationTrends.doubtful.trend > 0) riskFactors.push("Doubtful loans increasing");
  if (classificationTrends.loss.trend > 0) riskFactors.push("Loss loans increasing");

  if (riskFactors.length === 0) return "LOW_RISK";
  if (riskFactors.length <= 2) return "MODERATE_RISK";
  if (riskFactors.length <= 4) return "HIGH_RISK";
  return "CRITICAL_RISK";
}

// ============================================================================
// ADD TO: controllers/loanClassificationController.ts
// ============================================================================


getPARByLoanOfficer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const result = await this.loanClassificationService.getPARByLoanOfficer(
      organizationId,
      asOfDate
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get PAR by loan officer controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while generating PAR by loan officer",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
// PAR by Branch
getPARByBranch = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const result = await this.loanClassificationService.getPARByBranch(
      organizationId,
      asOfDate
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get PAR by branch controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while generating PAR by branch",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
async getPARReportWithTrends(
  organizationId: number,
  startDate: Date,
  endDate: Date
): Promise<ServiceResponse> {
  try {
    // Get snapshots for the date range
    const snapshots = await this.getDailySnapshots(organizationId, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }, 1, 365); // Large limit to get all snapshots in range

    if (!snapshots.success) {
      return snapshots;
    }

    // Calculate PAR trends
    const parTrends = this.calculatePARTrends(snapshots.data.snapshots);

    return {
      success: true,
      message: "PAR trends report generated successfully",
      data: {
        period: {
          startDate,
          endDate
        },
        trends: parTrends,
        summary: snapshots.data.summary,
        recommendations: this.generatePARTrendRecommendations(parTrends)
      }
    };

  } catch (error: any) {
    console.error("Get PAR report with trends error:", error);
    return {
      success: false,
      message: "Failed to generate PAR trends report"
    };
  }
}

private calculatePARTrends(snapshots: any[]): any {
  if (snapshots.length < 2) {
    return { hasEnoughData: false };
  }

  const sortedSnapshots = [...snapshots].sort((a, b) => 
    new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime()
  );

  const trends = sortedSnapshots.map((snapshot, index) => ({
    date: snapshot.snapshotDate,
    totalPAR: snapshot.totalPARAmount || 0,
    parRatio: snapshot.totalPARRatio || 0,
    par1to30: snapshot.parBreakdown?.par1to30 || 0,
    par31to90: snapshot.parBreakdown?.par31to90 || 0,
    par90plus: snapshot.parBreakdown?.par90plus || 0
  }));

  return {
    hasEnoughData: true,
    dataPoints: trends,
    summary: {
      startPAR: trends[0].parRatio,
      endPAR: trends[trends.length - 1].parRatio,
      change: trends[trends.length - 1].parRatio - trends[0].parRatio,
      trendDirection: trends[trends.length - 1].parRatio > trends[0].parRatio ? 'INCREASING' : 'DECREASING'
    }
  };
}

private generatePARTrendRecommendations(trends: any): string[] {
  const recommendations: string[] = [];

  if (!trends.hasEnoughData) {
    recommendations.push("Insufficient data for trend analysis.");
    return recommendations;
  }

  const { startPAR, endPAR, change, trendDirection } = trends.summary;

  if (trendDirection === 'INCREASING' && change > 2) {
    recommendations.push(`⚠️ PAR is increasing significantly (${change.toFixed(1)}% points). Review collection strategies.`);
  } else if (trendDirection === 'DECREASING' && change < -1) {
    recommendations.push(`✅ PAR is improving (${Math.abs(change).toFixed(1)}% points decrease). Continue current strategies.`);
  }

  if (endPAR > 15) {
    recommendations.push("🚨 High overall PAR detected. Immediate portfolio review required.");
  }

  return recommendations;
}

getComprehensiveClassificationReport = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // ========================================
    // STEP 1: Extract and validate parameters
    // ========================================
    const organizationId = parseInt(req.params.organizationId);
    
    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID"
      });
      return;
    }

    // Extract optional query parameters
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const includeMovements = req.query.includeMovements !== 'false'; // Default true
    const includeInsights = req.query.includeInsights !== 'false'; // Default true

    console.log('=== COMPREHENSIVE CLASSIFICATION REPORT REQUEST ===');
    console.log('Organization ID:', organizationId);
    console.log('Date Range:', { startDate, endDate });
    console.log('Options:', { includeMovements, includeInsights });

    // ========================================
    // STEP 2: Call service method
    // ========================================
    const result = await this.loanClassificationService.getComprehensiveClassificationReport(
      organizationId,
      { startDate, endDate },
      { includeMovements, includeInsights }
    );

    // ========================================
    // STEP 3: Send response
    // ========================================
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
        meta: {
          generatedAt: new Date().toISOString(),
          requestParams: {
            organizationId,
            dateRange: { startDate, endDate },
            options: { includeMovements, includeInsights }
          }
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message || "Failed to generate comprehensive classification report"
      });
    }

  } catch (error: any) {
    console.error("Comprehensive classification report controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while generating comprehensive classification report",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
}

export default new LoanClassificationController();