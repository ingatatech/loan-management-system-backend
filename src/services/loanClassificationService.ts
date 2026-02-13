// @ts-nocheck

import { Repository, QueryRunner } from "typeorm";
import { LoanClassification, LoanClass } from "../entities/LoanClassification";
import { Loan, LoanStatus } from "../entities/Loan";
import { RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";
import dbConnection from "../db";

interface WriteOffReportEntry {
  borrowerName: string;

  borrowerNationalId: string;

  telephoneNumber: string;

  accountNumber: string;

  gender: string;

  age: number;

  relationshipWithNDFSP: string;

  annualInterestRate: number;

  interestCalculationMethod: string;

  physicalGuarantee: string;

  district: string;

  sector: string;

  cell: string;

  village: string;

  disbursementDate: Date;

  disbursedAmount: number;

  maturityDate: Date;

  amountRepaid: number;

  loanBalanceOutstanding: number;

  securitySavings: number;

  amountWrittenOff: number;

  dateOfWriteOff: Date | null;

  recoveriesOnWrittenOff: number;

  remainingBalanceToRecover: number;

  daysInArrears: number;
  loanId: string;
  loanStatus: string;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

interface ComprehensiveClassificationReport {
  reportMetadata: {
    generatedAt: Date;
    organizationId: number;
    dateRange: { startDate?: string; endDate?: string };
    totalLoans: number;
    reportType: 'COMPREHENSIVE';
  };

  overallSummary: {
    totalPortfolio: number;
    totalProvisionsRequired: number;
    averageCollateralCoverage: number;
    portfolioHealthScore: number;
    totalDisbursed: number;
    averageLoanSize: number;
    totalCollateralValue: number;
    netPortfolioValue: number;
  };

  classificationReports: {
    normal: any;
    watch: any;
    substandard: any;
    doubtful: any;
    loss: any;
  };

  writeOffLoansReport?: {
    title: string;
    description: string;
    criteria: string;
    reportDate: Date;
    totalLoans: number;
    totalAmountWrittenOff: number;
    totalRemainingBalance: number;
    loans: WriteOffReportEntry[];
    summary: {
      byGender: Record<string, number>;
      byDistrict: Record<string, number>;
      byRelationship: Record<string, number>;
      averageAge: number;
      averageDaysInArrears: number;
      recoveryRate: number;
    };
  };

  aggregatedInsights: {
    riskDistribution: Record<LoanClass, number>;
    provisioningAdequacy: number;
    recommendations: string[];
    portfolioComposition: {
      byClass: Record<string, { count: number; percentage: number; amount: number }>;
      byRiskLevel: Record<string, number>;
    };
  };
}
export interface ClassificationResult {
  loanId: string;
  borrowerName: string;
  daysInArrears: number;
  loanClass: LoanClass;
  outstandingBalance: number;
  collateralValue: number;
  netExposure: number;
  provisioningRate: number;
  provisionRequired: number;
  previousProvisionsHeld: number;
  additionalProvisionsThisPeriod: number;
}

export interface ProvisioningReport {
  totalLoans: number;
  totalOutstandingBalance: number;
  totalProvisionRequired: number;
  totalAdditionalProvisions: number;
  classificationBreakdown: {
    [key in LoanClass]: {
      count: number;
      totalBalance: number;
      totalProvisions: number;
    };
  };
  organizationId: number;
  reportDate: Date;
}

export class LoanClassificationService {
  constructor(
    private classificationRepository: Repository<LoanClassification>,
    private loanRepository: Repository<Loan>,
    private scheduleRepository: Repository<RepaymentSchedule>
  ) { }

  // Calculate Days in Arrears (Fixed Implementation)
  async calculateDaysInArrears(loanId: number, organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['repaymentSchedules']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      const today = new Date();
      const overdueSchedules = loan.repaymentSchedules?.filter(schedule =>
        schedule.dueDate < today && schedule.status !== ScheduleStatus.PAID
      ) || [];

      let daysInArrears = 0;

      if (overdueSchedules.length > 0) {
        const earliestOverdueDate = overdueSchedules.reduce((earliest, schedule) =>
          schedule.dueDate < earliest ? schedule.dueDate : earliest,
          overdueSchedules[0].dueDate
        );

        daysInArrears = Math.floor(
          (today.getTime() - earliestOverdueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      return {
        success: true,
        message: "Days in arrears calculated successfully",
        data: Math.max(0, daysInArrears)
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to calculate days in arrears"
      };
    }
  }
  // Fix the getLoanClassifications method in LoanClassificationService
  async getLoanClassifications(
    organizationId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      // Get the latest classification for each loan in the organization
      const [loans, totalItems] = await this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.classifications', 'classifications')
        .leftJoinAndSelect('loan.collaterals', 'collaterals')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere((qb) => {
          // Subquery to get the latest classification for each loan
          const subQuery = qb
            .subQuery()
            .select('MAX(c.classificationDate)')
            .from(LoanClassification, 'c')
            .where('c.loanId = loan.id')
            .getQuery();
          return `classifications.classificationDate = (${subQuery})`;
        })
        .orderBy('classifications.classificationDate', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      // Transform the data to match the frontend expectations
      const classifications = loans.map(loan => {
        const latestClassification = loan.classifications && loan.classifications.length > 0
          ? loan.classifications[0]
          : null;

        if (!latestClassification) {
          // If no classification exists, create a default one
          return {
            id: 0, // Temporary ID
            loanId: loan.id,
            classificationDate: new Date().toISOString(),
            daysInArrears: loan.daysInArrears || 0,
            currentStatus: this.mapLoanClassToStatus(loan.status as any),
            previousStatus: this.mapLoanClassToStatus(loan.status as any),
            outstandingPrincipal: loan.outstandingPrincipal || 0,
            accruedInterest: loan.accruedInterestToDate || 0,
            netExposure: this.calculateNetExposureFromLoan(loan),
            provisioningRate: this.determineProvisioningRate(this.getLoanClassFromArrears(loan.daysInArrears || 0)),
            provisionRequired: loan.calculateProvisionRequired ? loan.calculateProvisionRequired() : 0,
            riskRating: this.getRiskRating(loan.daysInArrears || 0),
            notes: "Auto-generated classification",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }

        // FIX: Ensure classificationDate is properly converted to Date object
        const classificationDate = latestClassification.classificationDate instanceof Date
          ? latestClassification.classificationDate
          : new Date(latestClassification.classificationDate);

        // FIX: Ensure createdAt is properly converted to Date object
        const createdAt = latestClassification.createdAt instanceof Date
          ? latestClassification.createdAt
          : new Date(latestClassification.createdAt);

        return {
          id: latestClassification.id,
          loanId: loan.id,
          classificationDate: classificationDate.toISOString(),
          daysInArrears: latestClassification.daysInArrears,
          currentStatus: this.mapLoanClassToStatus(latestClassification.loanClass),
          previousStatus: this.mapLoanClassToStatus(latestClassification.loanClass),
          outstandingPrincipal: latestClassification.outstandingBalance,
          accruedInterest: 0, // You may need to calculate this separately
          netExposure: latestClassification.netExposure,
          provisioningRate: latestClassification.provisioningRate,
          provisionRequired: latestClassification.provisionRequired,
          riskRating: this.getRiskRating(latestClassification.daysInArrears),
          notes: latestClassification.notes || "",
          createdAt: createdAt.toISOString(),
          updatedAt: latestClassification.updatedAt
            ? (latestClassification.updatedAt instanceof Date
              ? latestClassification.updatedAt.toISOString()
              : typeof latestClassification.updatedAt === 'string' || typeof latestClassification.updatedAt === 'number'
                ? new Date(latestClassification.updatedAt).toISOString()
                : createdAt.toISOString())
            : createdAt.toISOString()
        };
      });

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: "Loan classifications retrieved successfully",
        data: classifications,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to retrieve loan classifications"
      };
    }
  }

  private mapLoanClassToStatus(loanClass: LoanClass): LoanStatus {
    const mapping: { [key in LoanClass]: LoanStatus } = {
      [LoanClass.NORMAL]: LoanStatus.PERFORMING,
      [LoanClass.WATCH]: LoanStatus.WATCH,
      [LoanClass.SUBSTANDARD]: LoanStatus.SUBSTANDARD,
      [LoanClass.DOUBTFUL]: LoanStatus.DOUBTFUL,
      [LoanClass.LOSS]: LoanStatus.LOSS
    };

    return mapping[loanClass] || LoanStatus.PERFORMING;
  }
  private getMaxDaysOverdueForLoan(loan: Loan): number {
    if (!loan.repaymentSchedules || loan.repaymentSchedules.length === 0) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let maxDaysOverdue = 0;

    for (const schedule of loan.repaymentSchedules) {
      if (schedule.isPaid) continue;

      const dueDate = schedule.dueDate instanceof Date
        ? schedule.dueDate
        : new Date(schedule.dueDate);

      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        maxDaysOverdue = Math.max(maxDaysOverdue, daysOverdue);
      }
    }

    return maxDaysOverdue;
  }

  async getPARByLoanOfficer(
    organizationId: number,
    asOfDate: Date = new Date()
  ): Promise<ServiceResponse> {
    try {
      // Get all active loans for the organization with loan officer information
      const loans = await this.loanRepository.find({
        where: {
          organizationId,
          isActive: true
        },
        relations: ['repaymentSchedules', 'borrower', 'transactions']
      });

      if (!loans.length) {
        return {
          success: true,
          message: "No loans found for organization",
          data: {
            parByOfficer: {},
            summary: {
              totalOfficers: 0,
              totalPortfolio: 0,
              totalPAR: 0,
              averagePAR: 0,
              totalLoans: 0
            },
            reportDate: asOfDate
          }
        };
      }

      // Group loans by loan officer
      const loansByOfficer: { [officerName: string]: Loan[] } = {};

      loans.forEach(loan => {
        const officer = loan.loanOfficer || 'Unassigned';
        if (!loansByOfficer[officer]) {
          loansByOfficer[officer] = [];
        }
        loansByOfficer[officer].push(loan);
      });

      const parByOfficer: any = {};
      let totalOrganizationPortfolio = 0;
      let totalOrganizationPAR = 0;
      let totalOrganizationLoans = 0;

      // Calculate PAR for each loan officer
      for (const [officerName, officerLoans] of Object.entries(loansByOfficer)) {
        const results = {
          par1to30: { count: 0, amount: 0, percentage: 0 },
          par31to90: { count: 0, amount: 0, percentage: 0 },
          par90plus: { count: 0, amount: 0, percentage: 0 },
          totalPAR: { amount: 0, percentage: 0 },
          totalPortfolio: 0,
          loanCount: officerLoans.length,
          officerName: officerName,
          performingLoans: 0,
          nonPerformingLoans: 0
        };

        // Calculate PAR for each loan in this officer's portfolio
        officerLoans.forEach(loan => {
          const daysOverdue = this.getMaxDaysOverdueForLoan(loan);
          const outstanding = loan.outstandingPrincipal || 0;

          results.totalPortfolio += outstanding;
          totalOrganizationPortfolio += outstanding;
          totalOrganizationLoans++;

          // Classify as performing or non-performing
          if (daysOverdue === 0) {
            results.performingLoans++;
          } else {
            results.nonPerformingLoans++;
          }

          if (daysOverdue >= 1 && daysOverdue <= 30) {
            results.par1to30.count++;
            results.par1to30.amount += outstanding;
          } else if (daysOverdue >= 31 && daysOverdue <= 90) {
            results.par31to90.count++;
            results.par31to90.amount += outstanding;
          } else if (daysOverdue >= 91) {
            results.par90plus.count++;
            results.par90plus.amount += outstanding;
          }
        });

        // Calculate total PAR for this officer
        results.totalPAR.amount = results.par1to30.amount + results.par31to90.amount + results.par90plus.amount;
        totalOrganizationPAR += results.totalPAR.amount;

        // Calculate percentages
        if (results.totalPortfolio > 0) {
          results.par1to30.percentage = Math.round((results.par1to30.amount / results.totalPortfolio) * 10000) / 100;
          results.par31to90.percentage = Math.round((results.par31to90.amount / results.totalPortfolio) * 10000) / 100;
          results.par90plus.percentage = Math.round((results.par90plus.amount / results.totalPortfolio) * 10000) / 100;
          results.totalPAR.percentage = Math.round((results.totalPAR.amount / results.totalPortfolio) * 10000) / 100;
        }

        // Round amounts
        results.totalPortfolio = Math.round(results.totalPortfolio * 100) / 100;
        results.totalPAR.amount = Math.round(results.totalPAR.amount * 100) / 100;
        results.par1to30.amount = Math.round(results.par1to30.amount * 100) / 100;
        results.par31to90.amount = Math.round(results.par31to90.amount * 100) / 100;
        results.par90plus.amount = Math.round(results.par90plus.amount * 100) / 100;

        parByOfficer[officerName] = results;
      }

      // Calculate organization-wide averages
      const averagePAR = totalOrganizationPortfolio > 0
        ? Math.round((totalOrganizationPAR / totalOrganizationPortfolio) * 10000) / 100
        : 0;

      return {
        success: true,
        message: 'PAR by loan officer report generated successfully',
        data: {
          parByOfficer,
          summary: {
            totalOfficers: Object.keys(loansByOfficer).length,
            totalPortfolio: Math.round(totalOrganizationPortfolio * 100) / 100,
            totalPAR: Math.round(totalOrganizationPAR * 100) / 100,
            averagePAR: averagePAR,
            totalLoans: totalOrganizationLoans,
            reportDate: asOfDate
          },
          recommendations: this.generatePARRecommendations(parByOfficer)
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to generate PAR by loan officer report"
      };
    }
  }

  private generatePARRecommendations(parByOfficer: any): string[] {
    const recommendations: string[] = [];
    const highPARThreshold = 10; // 10% PAR considered high
    const criticalPARThreshold = 20; // 20% PAR considered critical

    for (const [officerName, data] of Object.entries(parByOfficer)) {
      const officerData = data as any;

      if (officerData.totalPAR.percentage > criticalPARThreshold) {
        recommendations.push(
          `🚨 CRITICAL: ${officerName} has very high PAR (${officerData.totalPAR.percentage.toFixed(1)}%). Immediate review and intervention required.`
        );
      } else if (officerData.totalPAR.percentage > highPARThreshold) {
        recommendations.push(
          `⚠️ WARNING: ${officerName} has elevated PAR (${officerData.totalPAR.percentage.toFixed(1)}%). Close monitoring and support recommended.`
        );
      }

      // Check for high 90+ days PAR specifically
      if (officerData.par90plus.percentage > 5) {
        recommendations.push(
          `🔍 ${officerName} has significant long-term arrears (${officerData.par90plus.percentage.toFixed(1)}% 90+ days). Consider recovery actions and portfolio review.`
        );
      }

      // Positive feedback for good performance
      if (officerData.totalPAR.percentage < 2 && officerData.loanCount > 5) {
        recommendations.push(
          `✅ EXCELLENT: ${officerName} maintains excellent portfolio quality (${officerData.totalPAR.percentage.toFixed(1)}% PAR).`
        );
      }
    }

    // Add general recommendations if no specific issues found
    if (recommendations.length === 0) {
      recommendations.push("✅ All loan officers maintaining healthy portfolio quality within acceptable PAR limits.");
    }

    return recommendations;
  }
  // Helper method to calculate net exposure from loan
  private calculateNetExposureFromLoan(loan: Loan): number {
    const collateralValue = loan.collaterals?.reduce((sum, collateral) =>
      sum + (collateral.collateralValue || 0), 0) || 0;

    return Math.max(0, (loan.outstandingPrincipal || 0) - collateralValue);
  }

  // Helper method to get risk rating
  private getRiskRating(daysInArrears: number): string {
    if (daysInArrears >= 180) return "HIGH";
    if (daysInArrears >= 90) return "MEDIUM_HIGH";
    if (daysInArrears >= 30) return "MEDIUM";
    if (daysInArrears >= 1) return "LOW";
    return "VERY_LOW";
  }
  // Update Loan Status
  async updateLoanStatus(loanId: number, organizationId: number): Promise<ServiceResponse<LoanStatus>> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const arrearsResult = await this.calculateDaysInArrears(loanId, organizationId);

      if (!arrearsResult.success) {
        throw new Error(arrearsResult.message);
      }

      const daysInArrears = arrearsResult.data || 0;

      const loan = await queryRunner.manager.findOne(Loan, {
        where: { id: loanId, organizationId },
        relations: ['transactions']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      const totalPrincipalPaid = loan.transactions
        ?.filter(t => t.isActive)
        .reduce((sum, t) => sum + t.principalPaid, 0) || 0;

      const currentOutstandingPrincipal = Math.max(0, loan.disbursedAmount - totalPrincipalPaid);

      let newStatus: LoanStatus;

      if (currentOutstandingPrincipal <= 0) {
        newStatus = LoanStatus.CLOSED;
      } else if (daysInArrears <= 30) {
        newStatus = LoanStatus.PERFORMING;
      } else if (daysInArrears <= 90) {
        newStatus = LoanStatus.WATCH;
      } else if (daysInArrears <= 180) {
        newStatus = LoanStatus.SUBSTANDARD;
      } else if (daysInArrears <= 365) {
        newStatus = LoanStatus.DOUBTFUL;
      } else {
        newStatus = LoanStatus.LOSS;
      }

      await queryRunner.manager.update(Loan, loanId, {
        status: newStatus,
        daysInArrears,
        outstandingPrincipal: currentOutstandingPrincipal,
        updatedAt: new Date()
      });

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Loan status updated successfully",
        data: newStatus
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      return {
        success: false,
        message: error.message || "Failed to update loan status"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // Get Current Outstanding Principal
  async getCurrentOutstandingPrincipal(loanId: number, organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['transactions']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      const totalPrincipalPaid = loan.transactions
        ?.filter(t => t.isActive)
        .reduce((sum, t) => sum + t.principalPaid, 0) || 0;

      const currentOutstandingPrincipal = Math.max(0, loan.disbursedAmount - totalPrincipalPaid);

      return {
        success: true,
        message: "Current outstanding principal calculated successfully",
        data: currentOutstandingPrincipal
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to get current outstanding principal"
      };
    }
  }

  // Get Current Accrued Interest
  async getCurrentAccruedInterest(loanId: number, organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['transactions']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      const totalInterestPaid = loan.transactions
        ?.filter(t => t.isActive)
        .reduce((sum, t) => sum + t.interestPaid, 0) || 0;

      const currentAccruedInterest = Math.max(0, loan.accruedInterestToDate - totalInterestPaid);

      return {
        success: true,
        message: "Current accrued interest calculated successfully",
        data: currentAccruedInterest
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to get current accrued interest"
      };
    }
  }

  // Calculate Net Exposure
  async calculateNetExposure(loanId: number, organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['collaterals', 'transactions']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      const outstandingPrincipalResult = await this.getCurrentOutstandingPrincipal(loanId, organizationId);
      const accruedInterestResult = await this.getCurrentAccruedInterest(loanId, organizationId);

      if (!outstandingPrincipalResult.success || !accruedInterestResult.success) {
        return {
          success: false,
          message: "Failed to calculate outstanding balances"
        };
      }

      const totalOutstanding = (outstandingPrincipalResult.data || 0) + (accruedInterestResult.data || 0);
      const totalCollateralValue = loan.totalCollateralValue || 0;

      const netExposure = Math.max(0, totalOutstanding - totalCollateralValue);

      return {
        success: true,
        message: "Net exposure calculated successfully",
        data: netExposure
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to calculate net exposure"
      };
    }
  }

  // Determine Provisioning Rate
  determineProvisioningRate(loanClass: LoanClass): number {
    const provisioningRates = {
      [LoanClass.NORMAL]: 0.01,      // 1%
      [LoanClass.WATCH]: 0.05,       // 5%
      [LoanClass.SUBSTANDARD]: 0.25, // 25%
      [LoanClass.DOUBTFUL]: 0.50,    // 50%
      [LoanClass.LOSS]: 1.00         // 100%
    };

    return provisioningRates[loanClass] || 0.01;
  }

  // Calculate Provision Required
  async calculateProvisionRequired(loanId: number, organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['repaymentSchedules', 'collaterals']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      const arrearsResult = await this.calculateDaysInArrears(loanId, organizationId);
      if (!arrearsResult.success) {
        return {
          success: false,
          message: arrearsResult.message
        };
      }

      const daysInArrears = arrearsResult.data || 0;
      const loanClass = this.getLoanClassFromArrears(daysInArrears);
      const provisioningRate = this.determineProvisioningRate(loanClass);

      const netExposureResult = await this.calculateNetExposure(loanId, organizationId);
      if (!netExposureResult.success) {
        return {
          success: false,
          message: netExposureResult.message
        };
      }

      const netExposure = netExposureResult.data || 0;
      const provisionRequired = netExposure * provisioningRate;

      return {
        success: true,
        message: "Provision required calculated successfully",
        data: provisionRequired
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to calculate provision required"
      };
    }
  }

  async calculateProvisions(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse<ClassificationResult>> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'collaterals', 'repaymentSchedules', 'transactions', 'classifications']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      // Calculate current loan metrics
      const arrearsResult = await this.calculateDaysInArrears(loanId, organizationId);
      if (!arrearsResult.success) {
        return {
          success: false,
          message: arrearsResult.message
        };
      }

      const daysInArrears = arrearsResult.data || 0;
      const loanClass = this.getLoanClassFromArrears(daysInArrears);

      const outstandingPrincipalResult = await this.getCurrentOutstandingPrincipal(loanId, organizationId);
      const accruedInterestResult = await this.getCurrentAccruedInterest(loanId, organizationId);

      if (!outstandingPrincipalResult.success || !accruedInterestResult.success) {
        return {
          success: false,
          message: "Failed to calculate current balances"
        };
      }

      const outstandingBalance = (outstandingPrincipalResult.data || 0) + (accruedInterestResult.data || 0);

      // ✅ Use effective collateral value with haircuts
      const collateralValue = loan.collaterals?.reduce(
        (sum, c) => sum + c.effectiveValue,
        0
      ) || 0;

      const netExposure = Math.max(0, outstandingBalance - collateralValue);

      const provisioningRate = this.determineProvisioningRate(loanClass);
      const provisionRequired = netExposure * provisioningRate;

      // ========================================
      // ✅ NEW: Get previous provisions from last classification
      // ========================================
      const latestClassification = loan.classifications && loan.classifications.length > 0 ?
        loan.classifications.sort((a, b) =>
          new Date(b.classificationDate).getTime() - new Date(a.classificationDate).getTime()
        )[0] : null;

      // Previous provisions = last period's "Provision Required"
      const previousProvisionsHeld = latestClassification
        ? parseFloat(String(latestClassification.provisionRequired || 0))
        : 0;

      // ========================================
      // ✅ NEW: Calculate additional provisions
      // ========================================
      // Additional Provisions = Current Required - Previous Held
      // Positive = Need to add more (loan worsened)
      // Negative = Can release some (loan improved)
      // Zero = No change
      const additionalProvisionsThisPeriod = provisionRequired - previousProvisionsHeld;

      const result: ClassificationResult = {
        loanId: loan.loanId,
        borrowerName: loan.borrower?.fullName || 'Unknown',
        daysInArrears,
        loanClass,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
        collateralValue: Math.round(collateralValue * 100) / 100,
        netExposure: Math.round(netExposure * 100) / 100,
        provisioningRate,
        provisionRequired: Math.round(provisionRequired * 100) / 100,

        // ✅ NEW FIELDS in response
        previousProvisionsHeld: Math.round(previousProvisionsHeld * 100) / 100,
        additionalProvisionsThisPeriod: Math.round(additionalProvisionsThisPeriod * 100) / 100
      };

      return {
        success: true,
        message: "Loan classification and provisions calculated successfully",
        data: result
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to calculate provisions"
      };
    }
  }

  async createLoanClassification(
    loanId: number,
    organizationId: number,
    classificationDate: Date = new Date(),
    createdBy: number | null = null
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const provisionResult = await this.calculateProvisions(loanId, organizationId);

      if (!provisionResult.success) {
        throw new Error(provisionResult.message);
      }

      const classificationData = provisionResult.data!;

      const classification = queryRunner.manager.create(LoanClassification, {
        loanId,
        classificationDate,
        daysInArrears: classificationData.daysInArrears,
        loanClass: classificationData.loanClass,
        outstandingBalance: classificationData.outstandingBalance,
        collateralValue: classificationData.collateralValue,
        netExposure: classificationData.netExposure,
        provisioningRate: classificationData.provisioningRate,
        provisionRequired: classificationData.provisionRequired,

        // ✅ NEW: Store provision tracking data
        previousProvisionsHeld: classificationData.previousProvisionsHeld,
        additionalProvisionsThisPeriod: classificationData.additionalProvisionsThisPeriod,

        notes: `Automatic classification based on ${classificationData.daysInArrears} days in arrears. ` +
          `Previous provisions: ${classificationData.previousProvisionsHeld}, ` +
          `Additional needed: ${classificationData.additionalProvisionsThisPeriod}`,
        createdBy
      });

      const savedClassification = await queryRunner.manager.save(classification);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Loan classification created successfully with provision tracking",
        data: {
          classification: savedClassification,
          calculationDetails: classificationData,
          provisionSummary: {
            previousProvisions: classificationData.previousProvisionsHeld,
            currentRequired: classificationData.provisionRequired,
            additionalNeeded: classificationData.additionalProvisionsThisPeriod,
            provisionStatus: classificationData.additionalProvisionsThisPeriod > 0
              ? 'INCREASE_REQUIRED'
              : classificationData.additionalProvisionsThisPeriod < 0
                ? 'PROVISION_RELEASE'
                : 'NO_CHANGE'
          }
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      return {
        success: false,
        message: error.message || "Failed to create loan classification"
      };
    } finally {
      await queryRunner.release();
    }
  }

  private enhanceLoanDetailsWithProvisions(loanDetails: any[]): any[] {
    return loanDetails.map(detail => ({
      ...detail,

      // Add provision tracking to risk assessment
      riskAssessment: {
        ...detail.riskAssessment,

        // ✅ NEW: Provision tracking fields
        provisions: {
          previousProvisionsHeld: detail.riskAssessment.previousProvisionsHeld || 0,
          currentProvisionRequired: detail.riskAssessment.provisionRequired,
          additionalProvisionsNeeded: detail.riskAssessment.additionalProvisionsThisPeriod || 0,

          provisionChangeStatus: this.getProvisionChangeStatus(
            detail.riskAssessment.additionalProvisionsThisPeriod || 0
          ),

          provisionAdequacy: this.calculateProvisionAdequacy(
            detail.riskAssessment.previousProvisionsHeld || 0,
            detail.riskAssessment.provisionRequired
          )
        }
      }
    }));
  }
  private getProvisionChangeStatus(additionalProvisions: number): string {
    if (additionalProvisions > 0) return 'INCREASE_REQUIRED';
    if (additionalProvisions < 0) return 'PROVISION_RELEASE';
    return 'NO_CHANGE';
  }

  /**
   * ✅ NEW: Calculate provision adequacy percentage
   */
  private calculateProvisionAdequacy(previousHeld: number, required: number): number {
    if (required === 0) return 100;
    return Math.round((previousHeld / required) * 10000) / 100;
  }
  async generateProvisioningReport(
    organizationId: number,
    asOfDate: Date = new Date()
  ): Promise<ServiceResponse<ProvisioningReport & {
    collateralCoverageRatio: number;
    netPortfolioValue: number;
    provisionAdequacy: number;
    recommendations: string;
  }>> {
    try {
      const loans = await this.loanRepository.find({
        where: { organizationId },
        relations: ['borrower', 'collaterals', 'transactions', 'repaymentSchedules', 'classifications']
      });

      if (!loans.length) {
        return {
          success: true,
          message: "No loans found for organization",
          data: {
            totalLoans: 0,
            totalOutstandingBalance: 0,
            totalProvisionRequired: 0,
            totalAdditionalProvisions: 0,
            classificationBreakdown: {
              [LoanClass.NORMAL]: { count: 0, totalBalance: 0, totalProvisions: 0 },
              [LoanClass.WATCH]: { count: 0, totalBalance: 0, totalProvisions: 0 },
              [LoanClass.SUBSTANDARD]: { count: 0, totalBalance: 0, totalProvisions: 0 },
              [LoanClass.DOUBTFUL]: { count: 0, totalBalance: 0, totalProvisions: 0 },
              [LoanClass.LOSS]: { count: 0, totalBalance: 0, totalProvisions: 0 }
            },
            organizationId,
            reportDate: asOfDate,
            collateralCoverageRatio: 0,
            netPortfolioValue: 0,
            provisionAdequacy: 0,
            recommendations: "No loans available."
          }
        };
      }

      let totalOutstandingBalance = 0;
      let totalProvisionRequired = 0;
      let totalAdditionalProvisions = 0;
      let currentProvisions = 0;

      const classificationBreakdown = {
        [LoanClass.NORMAL]: { count: 0, totalBalance: 0, totalProvisions: 0 },
        [LoanClass.WATCH]: { count: 0, totalBalance: 0, totalProvisions: 0 },
        [LoanClass.SUBSTANDARD]: { count: 0, totalBalance: 0, totalProvisions: 0 },
        [LoanClass.DOUBTFUL]: { count: 0, totalBalance: 0, totalProvisions: 0 },
        [LoanClass.LOSS]: { count: 0, totalBalance: 0, totalProvisions: 0 }
      };

      for (const loan of loans) {
        try {
          const provisionResult = await this.calculateProvisions(loan.id, organizationId);

          if (provisionResult.success && provisionResult.data) {
            const data = provisionResult.data;

            totalOutstandingBalance += data.outstandingBalance;
            totalProvisionRequired += data.provisionRequired;
            totalAdditionalProvisions += data.additionalProvisionsThisPeriod;

            classificationBreakdown[data.loanClass].count++;
            classificationBreakdown[data.loanClass].totalBalance += data.outstandingBalance;
            classificationBreakdown[data.loanClass].totalProvisions += data.provisionRequired;

            currentProvisions += data.previousProvisionsHeld;
          }
        } catch (error: any) {
          // console.error(`Error processing loan ${loan.loanId}:`, error);
        }
      }

      // ✅ CORRECT: Already uses totalCollateralValue which applies haircuts via entity getter
      const totalCollateral = loans.reduce((sum, loan) =>
        sum + (loan.totalCollateralValue || 0), 0  // This already uses effective values!
      );

      const totalOutstanding = loans.reduce((sum, loan) =>
        sum + (loan.outstandingPrincipal || 0), 0
      );

      const collateralCoverageRatio = totalOutstanding > 0
        ? Math.round((totalCollateral / totalOutstanding) * 10000) / 100
        : 0;

      const netPortfolioValue = Math.round((totalOutstanding - totalProvisionRequired) * 100) / 100;

      const provisionAdequacy = totalProvisionRequired > 0
        ? Math.round((currentProvisions / totalProvisionRequired) * 10000) / 100
        : 100;

      const recommendations = this.generateProvisioningRecommendations(
        totalProvisionRequired,
        currentProvisions,
        provisionAdequacy,
        collateralCoverageRatio
      );

      const report: ProvisioningReport = {
        totalLoans: loans.length,
        totalOutstandingBalance: Math.round(totalOutstandingBalance * 100) / 100,
        totalProvisionRequired: Math.round(totalProvisionRequired * 100) / 100,
        totalAdditionalProvisions: Math.round(totalAdditionalProvisions * 100) / 100,
        classificationBreakdown,
        organizationId,
        reportDate: asOfDate
      };

      return {
        success: true,
        message: `Enhanced provisioning report generated successfully`,
        data: {
          ...report,
          collateralCoverageRatio,
          netPortfolioValue,
          provisionAdequacy,
          recommendations
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to generate provisioning report"
      };
    }
  }


  private generateProvisioningRecommendations(
    required: number,
    current: number,
    adequacy: number,
    collateralCoverage: number
  ): string {
    const gap = required - current;
    const recommendations: string[] = [];

    // Provision adequacy recommendations
    if (adequacy >= 100) {
      recommendations.push("✓ Provisioning is adequate. Current provisions meet or exceed requirements.");
    } else if (adequacy >= 75) {
      recommendations.push(`⚠ Provision gap detected: ${Math.round(gap * 100) / 100}. Consider increasing provisions by this amount.`);
    } else if (adequacy >= 50) {
      recommendations.push(`⚠ Urgent: Significant provision gap of ${Math.round(gap * 100) / 100} detected. Immediate action recommended.`);
    } else {
      recommendations.push(`🚨 Critical: Severe provision shortfall of ${Math.round(gap * 100) / 100}. Immediate provisioning action required.`);
    }

    // Collateral coverage recommendations
    if (collateralCoverage < 80) {
      recommendations.push(`⚠ Low collateral coverage (${collateralCoverage}%). Consider reviewing collateral requirements for new loans.`);
    } else if (collateralCoverage >= 100) {
      recommendations.push(`✓ Strong collateral coverage (${collateralCoverage}%). Portfolio is well-secured.`);
    }

    return recommendations.join(' ');
  }
  // Bulk Update Loan Classifications for Organization
  async bulkUpdateLoanClassifications(organizationId: number, createdBy: number | null = null): Promise<ServiceResponse> {
    try {
      const loans = await this.loanRepository.find({
        where: {
          organizationId,
          status: ['performing', 'watch', 'substandard', 'doubtful', 'loss'] as any
        }
      });

      let processedLoans = 0;
      let updatedStatuses = 0;
      const errors: string[] = [];

      for (const loan of loans) {
        try {
          const statusResult = await this.updateLoanStatus(loan.id, organizationId);
          if (statusResult.success) {
            processedLoans++;
            if (statusResult.data !== loan.status) {
              updatedStatuses++;
            }
          }

          const classificationResult = await this.createLoanClassification(
            loan.id,
            organizationId,
            new Date(),
            createdBy
          );

          if (!classificationResult.success) {
            errors.push(`Loan ${loan.loanId}: ${classificationResult.message}`);
          }

        } catch (loanError: any) {
          errors.push(`Loan ${loan.loanId}: ${loanError.message}`);
        }
      }

      return {
        success: true,
        message: `Bulk classification update completed for ${processedLoans} loans`,
        data: {
          totalLoans: loans.length,
          processedLoans,
          updatedStatuses,
          errors: errors.length > 0 ? errors.slice(0, 10) : [],
          totalErrors: errors.length
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to bulk update loan classifications"
      };
    }
  }

  // Get Loan Classification History
  async getLoanClassificationHistory(
    loanId: number,
    organizationId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const [classifications, totalItems] = await this.classificationRepository.findAndCount({
        where: { loanId },
        relations: ['loan'],
        order: { classificationDate: 'DESC' },
        skip,
        take: limit
      });

      if (classifications.length > 0 && classifications[0].loan.organizationId !== organizationId) {
        return {
          success: false,
          message: "Unauthorized access to loan classifications"
        };
      }

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: "Loan classification history retrieved successfully",
        data: classifications,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to retrieve loan classification history"
      };
    }
  }

  // Get Loans by Classification Class
  async getLoansByClassification(
    organizationId: number,
    loanClass: LoanClass,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const [loans, totalItems] = await this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.classifications', 'classifications')
        .leftJoinAndSelect('loan.collaterals', 'collaterals')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('MAX(c.classificationDate)')
            .from(LoanClassification, 'c')
            .where('c.loanId = loan.id')
            .getQuery();
          return `classifications.classificationDate = (${subQuery})`;
        })
        .andWhere('classifications.loanClass = :loanClass', { loanClass })
        .orderBy('loan.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: `Retrieved ${loans.length} loans with ${loanClass} classification`,
        data: loans,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to retrieve loans by classification"
      };
    }
  }

  // Helper method to determine loan class from arrears
  private getLoanClassFromArrears(daysInArrears: number): LoanClass {
    if (daysInArrears <= 30) return LoanClass.NORMAL;
    if (daysInArrears <= 90) return LoanClass.WATCH;
    if (daysInArrears <= 180) return LoanClass.SUBSTANDARD;
    if (daysInArrears <= 365) return LoanClass.DOUBTFUL;
    return LoanClass.LOSS;
  }

  async calculatePortfolioAtRisk(organizationId: number, asOfDate: Date = new Date()) {
    const loans = await this.loanRepository.find({
      where: { organizationId, isActive: true },
      relations: ['repaymentSchedules']
    });

    const results = {
      par1to30: { count: 0, amount: 0, percentage: 0 },
      par31to90: { count: 0, amount: 0, percentage: 0 },
      par90plus: { count: 0, amount: 0, percentage: 0 },
      totalPAR: { amount: 0, percentage: 0 },
      totalPortfolio: 0,
      reportDate: asOfDate
    };

    loans.forEach(loan => {
      const daysOverdue = loan.getMaxDaysOverdue();
      const outstanding = loan.outstandingPrincipal;

      results.totalPortfolio += outstanding;

      if (daysOverdue >= 1 && daysOverdue <= 30) {
        results.par1to30.count++;
        results.par1to30.amount += outstanding;
      } else if (daysOverdue >= 31 && daysOverdue <= 90) {
        results.par31to90.count++;
        results.par31to90.amount += outstanding;
      } else if (daysOverdue >= 91) {
        results.par90plus.count++;
        results.par90plus.amount += outstanding;
      }
    });

    results.totalPAR.amount = results.par1to30.amount + results.par31to90.amount + results.par90plus.amount;

    if (results.totalPortfolio > 0) {
      results.par1to30.percentage = (results.par1to30.amount / results.totalPortfolio) * 100;
      results.par31to90.percentage = (results.par31to90.amount / results.totalPortfolio) * 100;
      results.par90plus.percentage = (results.par90plus.amount / results.totalPortfolio) * 100;
      results.totalPAR.percentage = (results.totalPAR.amount / results.totalPortfolio) * 100;
    }

    return {
      success: true,
      message: 'PAR report generated successfully',
      data: results
    };
  }
  async getClassificationDetailedReport(
    orgId: number,
    loanClass: LoanClass,
    dateRange?: { startDate?: string; endDate?: string }
  ) {
    try {
      // Get loans in this classification with ALL related entities
      const loans = await this.loanRepository.find({
        where: {
          organizationId: orgId,
          status: this.mapLoanClassToStatus(loanClass)
        },
        relations: [
          'borrower',
          'collaterals',
          'classifications',
          'repaymentSchedules',
          'transactions',
          'organization'
        ]
      });

      // Calculate summary statistics
      const summary = {
        classCount: loans.length,
        totalOutstanding: loans.reduce((sum, l) => {
          const outstanding = parseFloat(String(l.outstandingPrincipal || 0));
          return sum + outstanding;
        }, 0),
        totalProvisionsRequired: loans.reduce((sum, l) => {
          const provision = this.calculateLoanProvision(l);
          return sum + provision;
        }, 0),
        averageDaysOverdue: loans.length > 0
          ? loans.reduce((sum, l) => sum + (l.getMaxDaysOverdue?.() || 0), 0) / loans.length
          : 0,
        collateralCoverage: this.calculateAverageCollateralCoverage(loans),
        totalDisbursed: loans.reduce((sum, l) => sum + (l.disbursedAmount || 0), 0),
        averageLoanSize: loans.length > 0
          ? loans.reduce((sum, l) => sum + (l.disbursedAmount || 0), 0) / loans.length
          : 0
      };

      // Round summary values
      summary.totalOutstanding = Math.round(summary.totalOutstanding * 100) / 100;
      summary.totalProvisionsRequired = Math.round(summary.totalProvisionsRequired * 100) / 100;
      summary.averageDaysOverdue = Math.round(summary.averageDaysOverdue * 100) / 100;
      summary.totalDisbursed = Math.round(summary.totalDisbursed * 100) / 100;
      summary.averageLoanSize = Math.round(summary.averageLoanSize * 100) / 100;

      // Get FULL loan details with all information
      const loanDetails = loans.map(loan => {
        const outstanding = parseFloat(String(loan.outstandingPrincipal || 0));
        const collateral = parseFloat(String(loan.totalCollateralValue || 0));
        const daysOverdue = loan.getMaxDaysOverdue?.() || 0;

        return {
          // === LOAN BASIC INFO ===
          loanId: loan.loanId,
          status: loan.status,
          disbursedAmount: Math.round((loan.disbursedAmount || 0) * 100) / 100,
          disbursementDate: loan.disbursementDate,
          agreedMaturityDate: loan.agreedMaturityDate,
          purposeOfLoan: loan.purposeOfLoan,
          branchName: loan.branchName,
          loanOfficer: loan.loanOfficer,

          // === LOAN TERMS ===
          termInMonths: loan.termInMonths,
          annualInterestRate: loan.annualInterestRate,
          interestMethod: loan.interestMethod,
          repaymentFrequency: loan.repaymentFrequency,
          gracePeriodMonths: loan.gracePeriodMonths,
          totalNumberOfInstallments: loan.totalNumberOfInstallments,

          // === BORROWER FULL INFORMATION ===
          borrowerInfo: {
            borrowerId: loan.borrower?.borrowerId,
            fullName: `${loan.borrower?.firstName || ''} ${loan.borrower?.lastName || ''}`.trim() || 'Unknown',
            firstName: loan.borrower?.firstName,
            lastName: loan.borrower?.lastName,
            middleName: loan.borrower?.middleName,
            nationalId: loan.borrower?.nationalId,
            gender: loan.borrower?.gender,
            dateOfBirth: loan.borrower?.dateOfBirth,
            age: loan.borrower?.age,
            maritalStatus: loan.borrower?.maritalStatus,

            // Contact Information
            primaryPhone: loan.borrower?.primaryPhone,
            alternativePhone: loan.borrower?.alternativePhone,
            email: loan.borrower?.email,

            // Address Details (Full hierarchy)
            address: {
              district: loan.borrower?.address?.district,
              sector: loan.borrower?.address?.sector,
              cell: loan.borrower?.address?.cell,
              village: loan.borrower?.address?.village,
              country: loan.borrower?.address?.country,
              province: loan.borrower?.address?.province,
              street: loan.borrower?.address?.street,
              houseNumber: loan.borrower?.address?.houseNumber,
              poBox: loan.borrower?.address?.poBox
            },

            // Economic Information
            occupation: loan.borrower?.occupation,
            monthlyIncome: loan.borrower?.monthlyIncome,
            incomeSource: loan.borrower?.incomeSource,

            // Relationship & Credit History
            relationshipWithNDFSP: loan.borrower?.relationshipWithNDFSP,
            previousLoansPaidOnTime: loan.borrower?.previousLoansPaidOnTime,
            creditScore: loan.borrower?.getCreditScore?.(),
            isEligibleForLoan: loan.borrower?.isEligibleForLoan?.()
          },

          // === COLLATERAL FULL INFORMATION ===
          collaterals: loan.collaterals?.map(collateral => ({
            collateralId: collateral.collateralId,
            collateralType: collateral.collateralType,
            description: collateral.description,

            // Valuation Details (with haircut)
            originalValue: Math.round((collateral.collateralValue || 0) * 100) / 100,
            effectiveValue: Math.round(collateral.effectiveValue * 100) / 100,
            valuationPercentage: collateral.getValuationPercentage() * 100,
            haircutPercentage: (1 - collateral.getValuationPercentage()) * 100,
            haircutAmount: Math.round((collateral.collateralValue - collateral.effectiveValue) * 100) / 100,

            // Valuation Info
            valuationDate: collateral.valuationDate,
            valuedBy: collateral.valuedBy,
            needsRevaluation: collateral.needsRevaluation(),
            valuationAge: collateral.getValuationAge(),

            // Guarantor Information
            guarantorName: collateral.guarantorName,
            guarantorPhone: collateral.guarantorPhone,
            guarantorAddress: collateral.guarantorAddress,

            // Documentation
            proofOfOwnershipUrl: collateral.proofOfOwnershipUrls,
            proofOfOwnershipType: collateral.proofOfOwnershipType,
            ownerIdentificationUrl: collateral.ownerIdentificationUrls,
            legalDocumentUrl: collateral.legalDocumentUrls,
            physicalEvidenceUrl: collateral.physicalEvidenceUrls,
            additionalDocumentsUrls: collateral.additionalDocumentsUrls,

            notes: collateral.notes,
            isActive: collateral.isActive
          })) || [],

          // === COLLATERAL SUMMARY ===
          collateralSummary: {
            totalOriginalValue: Math.round(
              (loan.collaterals?.reduce((sum, c) => sum + (c.collateralValue || 0), 0) || 0) * 100
            ) / 100,
            totalEffectiveValue: Math.round(collateral * 100) / 100,
            totalHaircutAmount: Math.round(
              (loan.collaterals?.reduce((sum, c) => sum + (c.collateralValue - c.effectiveValue), 0) || 0) * 100
            ) / 100,
            collateralCount: loan.collaterals?.length || 0,
            collateralTypes: loan.collaterals?.map(c => c.collateralType) || [],
            needsRevaluationCount: loan.collaterals?.filter(c => c.needsRevaluation()).length || 0
          },

          // === REPAYMENT SCHEDULE SUMMARY ===
          repaymentScheduleSummary: {
            totalInstallments: loan.totalNumberOfInstallments,
            paidInstallments: loan.repaymentSchedules?.filter(s => s.isPaid).length || 0,
            unpaidInstallments: loan.repaymentSchedules?.filter(s => !s.isPaid).length || 0,
            overdueInstallments: loan.repaymentSchedules?.filter(s =>
              !s.isPaid && new Date(s.dueDate) < new Date()
            ).length || 0,
            nextPaymentDue: loan.repaymentSchedules
              ?.filter(s => !s.isPaid && new Date(s.dueDate) >= new Date())
              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]?.dueDate || null,
            nextPaymentAmount: loan.monthlyInstallmentAmount
          },

          // === PAYMENT HISTORY SUMMARY ===
          paymentHistory: {
            totalPayments: loan.transactions?.filter(t => t.isActive).length || 0,
            totalAmountPaid: Math.round(
              (loan.transactions?.filter(t => t.isActive).reduce((sum, t) => sum + (t.amountPaid || 0), 0) || 0) * 100
            ) / 100,
            totalPrincipalPaid: Math.round(
              (loan.transactions?.filter(t => t.isActive).reduce((sum, t) => sum + (t.principalPaid || 0), 0) || 0) * 100
            ) / 100,
            totalInterestPaid: Math.round(
              (loan.transactions?.filter(t => t.isActive).reduce((sum, t) => sum + (t.interestPaid || 0), 0) || 0) * 100
            ) / 100,
            totalPenaltiesPaid: Math.round(
              (loan.transactions?.filter(t => t.isActive).reduce((sum, t) => sum + (t.penaltyPaid || 0), 0) || 0) * 100
            ) / 100,
            lastPaymentDate: loan.transactions
              ?.filter(t => t.isActive)
              .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]?.paymentDate || null,
            lastPaymentAmount: loan.transactions
              ?.filter(t => t.isActive)
              .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]?.amountPaid || 0
          },

          // === FINANCIAL METRICS ===
          financialMetrics: {
            outstandingBalance: Math.round(outstanding * 100) / 100,
            outstandingPrincipal: Math.round(outstanding * 100) / 100,
            accruedInterest: Math.round((loan.accruedInterestToDate || 0) * 100) / 100,
            totalAmountToBeRepaid: Math.round((loan.totalAmountToBeRepaid || 0) * 100) / 100,
            remainingBalance: Math.round((outstanding + (loan.accruedInterestToDate || 0)) * 100) / 100,
            monthlyInstallmentAmount: Math.round((loan.monthlyInstallmentAmount || 0) * 100) / 100,

            // Performance Metrics
            principalRecoveryRate: loan.disbursedAmount > 0
              ? Math.round(((loan.disbursedAmount - outstanding) / loan.disbursedAmount) * 10000) / 100
              : 0,
            paymentCompletionRate: loan.totalNumberOfInstallments > 0
              ? Math.round(((loan.repaymentSchedules?.filter(s => s.isPaid).length || 0) / loan.totalNumberOfInstallments) * 10000) / 100
              : 0
          },

          // === RISK ASSESSMENT ===
          riskAssessment: {
            daysOverdue: daysOverdue,
            daysInArrears: loan.daysInArrears || 0,
            currentClassification: loanClass,
            collateralCoverageRatio: outstanding > 0
              ? Math.round((collateral / outstanding) * 10000) / 100
              : 0,
            netExposure: Math.round(this.calculateLoanNetExposure(loan) * 100) / 100,
            provisionRequired: Math.round(this.calculateLoanProvision(loan) * 100) / 100,
            provisioningRate: this.determineProvisioningRate(loanClass),
            isOverdue: daysOverdue > 0,
            riskLevel: this.getRiskLevel(daysOverdue),
            isAdequatelyCollateralized: loan.isAdequatelyCollateralized?.() || false,
            collateralDeficiency: loan.getCollateralDeficiency?.() || 0
          },

          // === METADATA ===
          metadata: {
            createdAt: loan.createdAt,
            updatedAt: loan.updatedAt,
            createdBy: loan.createdBy,
            isActive: loan.isActive,
            notes: loan.notes
          }
        };
      });

      // Get movement analysis
      const movements = await this.getClassificationMovements(orgId, loanClass, dateRange);

      // Generate insights
      const insights = this.generateClassificationInsights(loans, loanDetails, summary);

      return {
        success: true,
        message: `Detailed report generated for ${loanClass} classification with ${loans.length} loans`,
        data: {
          summary,
          loanDetails,
          movements,
          insights,
          reportMetadata: {
            generatedAt: new Date(),
            organizationId: orgId,
            classification: loanClass,
            dateRange: dateRange || null,
            totalLoans: loans.length
          }
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to generate classification detailed report",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
    }
  }
  private generateClassificationInsights(
    loans: Loan[],
    loanDetails: any[],
    summary: any
  ): any {
    return {
      portfolioHealth: {
        averageCollateralCoverage: summary.collateralCoverage,
        averageDaysOverdue: summary.averageDaysOverdue,
        totalAtRisk: summary.totalOutstanding,
        provisionsNeeded: summary.totalProvisionsRequired
      },

      borrowerProfiles: {
        totalBorrowers: new Set(loans.map(l => l.borrowerId)).size,
        averageAge: Math.round(
          loans.reduce((sum, l) => sum + (l.borrower?.age || 0), 0) / loans.length
        ),
        genderDistribution: this.calculateGenderDistribution(loans),
        occupationDistribution: this.calculateOccupationDistribution(loans)
      },

      collateralInsights: {
        totalCollateralValue: loanDetails.reduce((sum, d) => sum + d.collateralSummary.totalEffectiveValue, 0),
        needsRevaluation: loanDetails.reduce((sum, d) => sum + d.collateralSummary.needsRevaluationCount, 0),
        collateralTypeBreakdown: this.calculateCollateralTypeBreakdown(loanDetails)
      },

      recommendations: this.generateRecommendations(summary, loanDetails)
    };
  }

  private generateRecommendations(summary: any, loanDetails: any[]): string[] {
    const recommendations: string[] = [];

    if (summary.collateralCoverage < 80) {
      recommendations.push("⚠️ Low collateral coverage detected. Consider requesting additional collateral.");
    }

    if (summary.averageDaysOverdue > 30) {
      recommendations.push("🚨 High average days overdue. Implement aggressive collection strategies.");
    }

    const needsRevaluation = loanDetails.reduce((sum, d) => sum + d.collateralSummary.needsRevaluationCount, 0);
    if (needsRevaluation > 0) {
      recommendations.push(`📋 ${needsRevaluation} collaterals need revaluation.`);
    }

    return recommendations;
  }

  private calculateOccupationDistribution(loans: Loan[]): any {
    const distribution: any = {};
    loans.forEach(loan => {
      const occupation = loan.borrower?.occupation || 'Unknown';
      distribution[occupation] = (distribution[occupation] || 0) + 1;
    });
    return distribution;
  }
  private calculateGenderDistribution(loans: Loan[]): any {
    const distribution: any = {};
    loans.forEach(loan => {
      const gender = loan.borrower?.gender || 'Unknown';
      distribution[gender] = (distribution[gender] || 0) + 1;
    });
    return distribution;
  }
  private calculateCollateralTypeBreakdown(loanDetails: any[]): any {
    const breakdown: any = {};
    loanDetails.forEach(detail => {
      detail.collaterals.forEach((collateral: any) => {
        const type = collateral.collateralType;
        if (!breakdown[type]) {
          breakdown[type] = {
            count: 0,
            totalOriginalValue: 0,
            totalEffectiveValue: 0
          };
        }
        breakdown[type].count++;
        breakdown[type].totalOriginalValue += collateral.originalValue;
        breakdown[type].totalEffectiveValue += collateral.effectiveValue;
      });
    });
    return breakdown;
  }
  private getRiskLevel(daysOverdue: number): string {
    if (daysOverdue === 0) return "LOW";
    if (daysOverdue <= 30) return "MODERATE";
    if (daysOverdue <= 90) return "HIGH";
    return "CRITICAL";
  }


  // ============================================================================
  // HELPER METHOD: Calculate loan provision (enhanced)
  // ============================================================================
  private calculateLoanProvision(loan: Loan): number {
    try {
      const netExposure = this.calculateLoanNetExposure(loan);
      const daysOverdue = loan.getMaxDaysOverdue?.() || 0;
      const loanClass = this.getLoanClassFromArrears(daysOverdue);
      const provisioningRate = this.determineProvisioningRate(loanClass);

      const provision = netExposure * provisioningRate;
      return Math.round(provision * 100) / 100;
    } catch (error) {
      return 0;
    }
  }

  // ============================================================================
  // HELPER METHOD: Calculate loan net exposure (enhanced with type safety)
  // ============================================================================
  private calculateLoanNetExposure(loan: Loan): number {
    try {
      // ✅ FIX: Ensure proper numeric parsing
      const outstanding = parseFloat(String(loan.outstandingPrincipal || 0));
      const collateral = parseFloat(String(loan.totalCollateralValue || 0));

      const netExposure = Math.max(0, outstanding - collateral);
      return Math.round(netExposure * 100) / 100;
    } catch (error) {
      return parseFloat(String(loan.outstandingPrincipal || 0));
    }
  }

  // ============================================================================
  // HELPER METHOD: Calculate average collateral coverage
  // ============================================================================
  private calculateAverageCollateralCoverage(loans: Loan[]): number {
    if (!loans.length) return 0;

    // ✅ FIX: Ensure numeric parsing in reduce operations
    const totalCollateral = loans.reduce((sum, loan) => {
      const collateral = parseFloat(String(loan.totalCollateralValue || 0));
      return sum + collateral;
    }, 0);

    const totalOutstanding = loans.reduce((sum, loan) => {
      const outstanding = parseFloat(String(loan.outstandingPrincipal || 0));
      return sum + outstanding;
    }, 0);

    const coverage = totalOutstanding > 0
      ? (totalCollateral / totalOutstanding) * 100
      : 0;

    return Math.round(coverage * 100) / 100;
  }


  // ============================================================================
  // ENHANCED: Get classification movements with proper data handling
  // ============================================================================
  async getClassificationMovements(
    orgId: number,
    loanClass: LoanClass,
    dateRange?: { startDate?: string; endDate?: string }
  ): Promise<any> {
    try {
      // Build query for current classifications
      let queryBuilder = this.classificationRepository
        .createQueryBuilder('classification')
        .leftJoinAndSelect('classification.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .where('classification.loanClass = :loanClass', { loanClass })
        .andWhere('loan.organizationId = :orgId', { orgId });

      // Apply date range filters
      if (dateRange?.startDate) {
        queryBuilder.andWhere('classification.classificationDate >= :startDate', {
          startDate: new Date(dateRange.startDate)
        });
      }
      if (dateRange?.endDate) {
        queryBuilder.andWhere('classification.classificationDate <= :endDate', {
          endDate: new Date(dateRange.endDate)
        });
      }

      queryBuilder.orderBy('classification.classificationDate', 'DESC');

      const currentClassifications = await queryBuilder.getMany();

      // Track movements
      const movements: any[] = [];
      let enteredCount = 0;
      let exitedCount = 0;

      // Process each classification to detect movements
      for (const current of currentClassifications) {
        // Find previous classification for this loan
        const previous = await this.classificationRepository
          .createQueryBuilder('prev')
          .where('prev.loanId = :loanId', { loanId: current.loanId })
          .andWhere('prev.classificationDate < :currentDate', {
            currentDate: current.classificationDate
          })
          .orderBy('prev.classificationDate', 'DESC')
          .getOne();

        const previousClass = previous?.loanClass || LoanClass.NORMAL;
        const movedFrom = previousClass !== loanClass ? previousClass : null;
        const isNewEntry = movedFrom !== null;

        if (isNewEntry) {
          enteredCount++;
        }

        // ✅ FIX: Ensure numeric values in movement data
        movements.push({
          loanId: current.loan.loanId,
          borrowerName: current.loan.borrower?.fullName || 'Unknown',
          classificationDate: current.classificationDate,
          currentClass: current.loanClass,
          previousClass: previousClass,
          movedFrom: movedFrom,
          isNewEntry: isNewEntry,
          daysInArrears: current.daysInArrears,
          provisionRequired: Math.round(parseFloat(String(current.provisionRequired)) * 100) / 100,
          outstandingBalance: Math.round(parseFloat(String(current.outstandingBalance)) * 100) / 100,
          netExposure: Math.round(parseFloat(String(current.netExposure)) * 100) / 100
        });
      }

      // Find loans that exited this class
      const exitedLoans = await this.classificationRepository
        .createQueryBuilder('classification')
        .leftJoinAndSelect('classification.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .where('loan.organizationId = :orgId', { orgId })
        .andWhere('classification.loanClass != :loanClass', { loanClass })
        .andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('prev.loanId')
            .from(LoanClassification, 'prev')
            .where('prev.loanClass = :loanClass', { loanClass })
            .andWhere('prev.classificationDate < classification.classificationDate')
            .getQuery();
          return `classification.loanId IN ${subQuery}`;
        });

      if (dateRange?.startDate) {
        exitedLoans.andWhere('classification.classificationDate >= :startDate', {
          startDate: new Date(dateRange.startDate)
        });
      }
      if (dateRange?.endDate) {
        exitedLoans.andWhere('classification.classificationDate <= :endDate', {
          endDate: new Date(dateRange.endDate)
        });
      }

      const exitedResults = await exitedLoans.getMany();
      exitedCount = exitedResults.length;

      // Calculate trend indicator
      const netChange = enteredCount - exitedCount;
      let trendIndicator: 'IMPROVING' | 'DETERIORATING' | 'STABLE' = 'STABLE';

      // Better classifications (NORMAL) increasing = improving
      // Worse classifications increasing = deteriorating
      if (loanClass === LoanClass.NORMAL) {
        trendIndicator = netChange > 0 ? 'IMPROVING' : netChange < 0 ? 'DETERIORATING' : 'STABLE';
      } else {
        trendIndicator = netChange > 0 ? 'DETERIORATING' : netChange < 0 ? 'IMPROVING' : 'STABLE';
      }

      return {
        movements,
        summary: {
          totalInClass: currentClassifications.length,
          enteredThisClass: enteredCount,
          exitedThisClass: exitedCount,
          netChange,
          trendIndicator,
          dateRange: {
            from: dateRange?.startDate || null,
            to: dateRange?.endDate || null
          }
        },
        exitedLoans: exitedResults.map(e => ({
          loanId: e.loan.loanId,
          borrowerName: e.loan.borrower?.fullName || 'Unknown',
          exitDate: e.classificationDate,
          newClass: e.loanClass
        }))
      };

    } catch (error: any) {
      throw new Error("Failed to retrieve classification movements");
    }
  }

  private calculateBreakdownSummary(breakdown: Record<string, any>): any {
    const summary: any = {};

    Object.keys(breakdown).forEach(key => {
      const data = breakdown[key];
      summary[key] = {
        count: data.count,
        totalGap: Math.round(data.totalGap * 100) / 100,
        totalRequired: Math.round(data.totalRequired * 100) / 100,
        totalHeld: Math.round(data.totalHeld * 100) / 100,
        averageAdequacy: data.totalRequired > 0
          ? Math.round((data.totalHeld / data.totalRequired) * 10000) / 100
          : 100,
        gapPercentage: data.totalRequired > 0
          ? Math.round((data.totalGap / data.totalRequired) * 10000) / 100
          : 0
      };
    });

    return summary;
  }

  private updateBreakdowns(
    classificationBreakdown: Record<string, any>,
    officerBreakdown: Record<string, any>,
    branchBreakdown: Record<string, any>,
    loan: Loan,
    data: any,
    adequacy: number
  ): void {
    // Update classification breakdown
    const loanClass = data.loanClass;
    if (!classificationBreakdown[loanClass]) {
      classificationBreakdown[loanClass] = {
        count: 0,
        totalGap: 0,
        totalRequired: 0,
        totalHeld: 0,
        averageAdequacy: 0,
        loans: []
      };
    }
    classificationBreakdown[loanClass].count++;
    classificationBreakdown[loanClass].totalRequired += data.provisionRequired;
    classificationBreakdown[loanClass].totalHeld += data.previousProvisionsHeld;
    classificationBreakdown[loanClass].totalGap += Math.max(0, data.provisionRequired - data.previousProvisionsHeld);

    // Update loan officer breakdown
    const officer = loan.loanOfficer || 'Unassigned';
    if (!officerBreakdown[officer]) {
      officerBreakdown[officer] = {
        count: 0,
        totalGap: 0,
        totalRequired: 0,
        totalHeld: 0,
        averageAdequacy: 0,
        loans: []
      };
    }
    officerBreakdown[officer].count++;
    officerBreakdown[officer].totalRequired += data.provisionRequired;
    officerBreakdown[officer].totalHeld += data.previousProvisionsHeld;
    officerBreakdown[officer].totalGap += Math.max(0, data.provisionRequired - data.previousProvisionsHeld);

    // Update branch breakdown
    const branch = loan.branchName || 'Head Office';
    if (!branchBreakdown[branch]) {
      branchBreakdown[branch] = {
        count: 0,
        totalGap: 0,
        totalRequired: 0,
        totalHeld: 0,
        averageAdequacy: 0,
        loans: []
      };
    }
    branchBreakdown[branch].count++;
    branchBreakdown[branch].totalRequired += data.provisionRequired;
    branchBreakdown[branch].totalHeld += data.previousProvisionsHeld;
    branchBreakdown[branch].totalGap += Math.max(0, data.provisionRequired - data.previousProvisionsHeld);
  }
  async identifyProvisionGaps(
    organizationId: number,
    adequacyThreshold: number = 0.8
  ): Promise<ServiceResponse> {
    try {
      const loans = await this.loanRepository.find({
        where: { organizationId, isActive: true },
        relations: ['borrower', 'collaterals', 'classifications', 'repaymentSchedules']
      });

      if (!loans.length) {
        return {
          success: true,
          message: "No loans found for organization",
          data: {
            provisionGaps: [],
            summary: {
              totalLoans: 0,
              loansWithGaps: 0,
              totalProvisionGap: 0,
              averageAdequacy: 100
            },
            breakdowns: {
              byClassification: {},
              byLoanOfficer: {},
              byBranch: {}
            }
          }
        };
      }

      const provisionGaps: any[] = [];
      let totalProvisionGap = 0;
      let totalRequiredProvisions = 0;
      let totalHeldProvisions = 0;

      // Initialize breakdown structures
      const breakdownByClassification: Record<string, any> = {};
      const breakdownByLoanOfficer: Record<string, any> = {};
      const breakdownByBranch: Record<string, any> = {};

      for (const loan of loans) {
        try {
          const provisionResult = await this.calculateProvisions(loan.id, organizationId);

          if (provisionResult.success && provisionResult.data) {
            const data = provisionResult.data;

            const provisionAdequacy = data.provisionRequired > 0
              ? (data.previousProvisionsHeld / data.provisionRequired)
              : 1;

            // Update breakdowns
            this.updateBreakdowns(
              breakdownByClassification,
              breakdownByLoanOfficer,
              breakdownByBranch,
              loan,
              data,
              provisionAdequacy
            );

            // Check if provision adequacy is below threshold
            if (provisionAdequacy < adequacyThreshold) {
              const provisionGap = data.provisionRequired - data.previousProvisionsHeld;

              provisionGaps.push({
                loanId: loan.loanId,
                borrowerName: loan.borrower?.fullName || 'Unknown',
                loanOfficer: loan.loanOfficer || 'Unassigned',
                branchName: loan.branchName || 'Head Office',
                loanClass: data.loanClass,
                daysInArrears: data.daysInArrears,
                outstandingBalance: data.outstandingBalance,
                collateralValue: data.collateralValue,
                netExposure: data.netExposure,
                provisionRequired: data.provisionRequired,
                provisionsHeld: data.previousProvisionsHeld,
                provisionGap: provisionGap,
                provisionAdequacy: Math.round(provisionAdequacy * 10000) / 100,
                adequacyStatus: this.getAdequacyStatus(provisionAdequacy),
                recommendation: this.getProvisionGapRecommendation(provisionAdequacy, provisionGap),
                priority: this.getGapPriority(provisionAdequacy, provisionGap)
              });

              totalProvisionGap += provisionGap;
            }

            totalRequiredProvisions += data.provisionRequired;
            totalHeldProvisions += data.previousProvisionsHeld;
          }
        } catch (error: any) {
          // console.error(`Error processing loan ${loan.loanId} for provision gap analysis:`, error);
        }
      }

      // Sort by largest gap first
      provisionGaps.sort((a, b) => b.provisionGap - a.provisionGap);

      const averageAdequacy = totalRequiredProvisions > 0
        ? Math.round((totalHeldProvisions / totalRequiredProvisions) * 10000) / 100
        : 100;

      // Calculate breakdown summaries
      const classificationSummary = this.calculateBreakdownSummary(breakdownByClassification);
      const officerSummary = this.calculateBreakdownSummary(breakdownByLoanOfficer);
      const branchSummary = this.calculateBreakdownSummary(breakdownByBranch);

      const summary = {
        totalLoans: loans.length,
        loansWithGaps: provisionGaps.length,
        totalProvisionGap: Math.round(totalProvisionGap * 100) / 100,
        averageAdequacy,
        gapPercentage: loans.length > 0 ? Math.round((provisionGaps.length / loans.length) * 10000) / 100 : 0,
        criticalGaps: provisionGaps.filter(gap => gap.provisionAdequacy < 50).length,
        warningGaps: provisionGaps.filter(gap => gap.provisionAdequacy >= 50 && gap.provisionAdequacy < 80).length,
        minorGaps: provisionGaps.filter(gap => gap.provisionAdequacy >= 80 && gap.provisionAdequacy < 100).length
      };

      // Generate actionable recommendations
      const recommendations = this.generateProvisionGapRecommendations(
        provisionGaps,
        summary,
        classificationSummary,
        officerSummary,
        branchSummary
      );

      return {
        success: true,
        message: `Enhanced provision gap analysis completed. Found ${provisionGaps.length} loans with gaps below ${adequacyThreshold * 100}% adequacy`,
        data: {
          provisionGaps,
          summary,
          breakdowns: {
            byClassification: classificationSummary,
            byLoanOfficer: officerSummary,
            byBranch: branchSummary
          },
          recommendations,
          threshold: adequacyThreshold * 100
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to identify provision gaps"
      };
    }
  }

  private getGapPriority(adequacy: number, gap: number): string {
    if (adequacy < 0.5) return 'CRITICAL';
    if (adequacy < 0.8) return 'HIGH';
    if (adequacy < 0.9) return 'MEDIUM';
    return 'LOW';
  }

  private generateProvisionGapRecommendations(
    gaps: any[],
    summary: any,
    classificationBreakdown: any,
    officerBreakdown: any,
    branchBreakdown: any
  ): string[] {
    const recommendations: string[] = [];

    // Overall recommendation
    if (summary.totalProvisionGap > 0) {
      recommendations.push(`🚨 **Urgent Action Required**: Total provision gap of ${summary.totalProvisionGap.toLocaleString()} detected across ${summary.loansWithGaps} loans.`);
    }

    // Classification-based recommendations
    Object.keys(classificationBreakdown).forEach(classification => {
      const data = classificationBreakdown[classification];
      if (data.totalGap > 0) {
        recommendations.push(`📊 **${classification.toUpperCase()} Loans**: ${data.totalGap.toLocaleString()} gap across ${data.count} loans (${data.gapPercentage}% of required)`);
      }
    });

    // Officer-based recommendations
    let highestOfficerGap = { name: '', gap: 0 };
    Object.keys(officerBreakdown).forEach(officer => {
      if (officerBreakdown[officer].totalGap > highestOfficerGap.gap) {
        highestOfficerGap = { name: officer, gap: officerBreakdown[officer].totalGap };
      }
    });

    if (highestOfficerGap.gap > 0) {
      recommendations.push(`👤 **Focus on ${highestOfficerGap.name}**: Highest individual gap of ${highestOfficerGap.gap.toLocaleString()}`);
    }

    // Priority recommendations
    const criticalGaps = gaps.filter(gap => gap.priority === 'CRITICAL');
    if (criticalGaps.length > 0) {
      recommendations.push(`🔴 **Immediate Attention**: ${criticalGaps.length} loans with critical provision gaps requiring immediate funding`);
    }

    // Branch recommendations
    Object.keys(branchBreakdown).forEach(branch => {
      const data = branchBreakdown[branch];
      if (data.averageAdequacy < 70) {
        recommendations.push(`🏢 **${branch} Branch**: Low provision adequacy of ${data.averageAdequacy}% - review collateral and risk assessment processes`);
      }
    });

    return recommendations;
  }

  // HELPER METHOD: Get adequacy status
  private getAdequacyStatus(adequacy: number): string {
    if (adequacy >= 1) return "ADEQUATE";
    if (adequacy >= 0.8) return "MINOR_GAP";
    if (adequacy >= 0.5) return "MODERATE_GAP";
    return "CRITICAL_GAP";
  }


  private createEmptyComprehensiveReport(
    organizationId: number,
    dateRange?: { startDate?: string; endDate?: string }
  ): ComprehensiveClassificationReport {
    return {
      reportMetadata: {
        generatedAt: new Date(),
        organizationId,
        dateRange: dateRange || {},
        totalLoans: 0,
        reportType: 'COMPREHENSIVE'
      },
      overallSummary: {
        totalPortfolio: 0,
        totalProvisionsRequired: 0,
        averageCollateralCoverage: 0,
        portfolioHealthScore: 0,
        totalDisbursed: 0,
        averageLoanSize: 0,
        totalCollateralValue: 0,
        netPortfolioValue: 0
      },
      classificationReports: {
        normal: this.createEmptyClassReport(LoanClass.NORMAL),
        watch: this.createEmptyClassReport(LoanClass.WATCH),
        substandard: this.createEmptyClassReport(LoanClass.SUBSTANDARD),
        doubtful: this.createEmptyClassReport(LoanClass.DOUBTFUL),
        loss: this.createEmptyClassReport(LoanClass.LOSS)
      },
      aggregatedInsights: {
        riskDistribution: {
          [LoanClass.NORMAL]: 0,
          [LoanClass.WATCH]: 0,
          [LoanClass.SUBSTANDARD]: 0,
          [LoanClass.DOUBTFUL]: 0,
          [LoanClass.LOSS]: 0
        },
        provisioningAdequacy: 100,
        recommendations: ["No loans found for this organization"],
        portfolioComposition: {
          byClass: {},
          byRiskLevel: {}
        }
      }
    };
  }
  // HELPER METHOD: Get recommendation based on gap
  private getProvisionGapRecommendation(adequacy: number, gap: number): string {
    if (adequacy >= 1) return "No action needed - provisions are adequate";
    if (adequacy >= 0.8) return `Consider increasing provisions by ${Math.round(gap * 100) / 100}`;
    if (adequacy >= 0.5) return `Priority: Increase provisions by ${Math.round(gap * 100) / 100}`;
    return `URGENT: Immediate provision increase needed of ${Math.round(gap * 100) / 100}`;
  }
  private createEmptyClassReport(loanClass: LoanClass): any {
    return {
      summary: {
        classCount: 0,
        totalOutstanding: 0,
        totalProvisionsRequired: 0,
        averageDaysOverdue: 0,
        collateralCoverage: 0,
        totalDisbursed: 0,
        averageLoanSize: 0
      },
      loanDetails: [],
      movements: {
        movements: [],
        summary: {
          totalInClass: 0,
          enteredThisClass: 0,
          exitedThisClass: 0,
          netChange: 0,
          trendIndicator: 'STABLE'
        },
        exitedLoans: []
      },
      insights: {
        portfolioHealth: {},
        borrowerProfiles: {},
        collateralInsights: {},
        recommendations: []
      },
      reportMetadata: {
        classification: loanClass
      }
    };
  }




  private _buildWriteOffReport(
    loans: Loan[],
    dateRange?: { startDate?: string; endDate?: string }
  ) {
    let filtered = loans.filter(l => (l.daysInArrears ?? 0) >= 720);
    if (dateRange?.startDate)
      filtered = filtered.filter(l => new Date(l.disbursementDate!) >= new Date(dateRange.startDate!));
    if (dateRange?.endDate)
      filtered = filtered.filter(l => new Date(l.disbursementDate!) <= new Date(dateRange.endDate!));

    const entries = filtered.map(loan => {
      const b = loan.borrower;
      const amountRepaid = loan.transactions
        ?.filter(t => t.isActive)
        .reduce((s, t) => s + Number(t.amountPaid || 0), 0) ?? 0;
      const loanBalance = Number(loan.outstandingPrincipal || 0) + Number(loan.accruedInterestToDate || 0);
      const securitySavings = loan.collaterals?.filter(c => c.isActive)
        .reduce((s, c) => s + Number(c.effectiveValue || 0), 0) ?? 0;
      const amountWrittenOff = Math.max(0, loanBalance - securitySavings);

      // Recoveries: payments after write-off date (if determinable)
      let writeOffDate: Date | null = null;
      const lossClass = loan.classifications
        ?.filter(c => c.loanClass === LoanClass.LOSS && c.daysInArrears >= 720)
        .sort((a, b) => new Date(a.classificationDate).getTime() - new Date(b.classificationDate).getTime())[0];
      if (lossClass) writeOffDate = new Date(lossClass.classificationDate);

      const recoveries = writeOffDate
        ? (loan.transactions?.filter(t => t.isActive && new Date(t.paymentDate) > writeOffDate!)
          .reduce((s, t) => s + Number(t.amountPaid || 0), 0) ?? 0)
        : 0;
      const remaining = Math.max(0, amountWrittenOff - recoveries);

      const dob = new Date(b?.dateOfBirth ?? 0);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      if (today.getMonth() < dob.getMonth() ||
        (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;

      return {
        borrowerName: b?.fullName ?? "",
        borrowerNationalId: b?.nationalId ?? "",
        telephoneNumber: b?.primaryPhone ?? "",
        accountNumber: loan.loanId,
        gender: b?.gender ?? "",
        age,
        relationshipWithNDFSP: b?.relationshipWithNDFSP ?? "",
        annualInterestRate: Number(loan.annualInterestRate),
        interestCalculationMethod: loan.interestMethod ?? "",
        physicalGuarantee: loan.collaterals?.map(c => `${c.collateralType}: ${c.description}`).join("; ") || "None",
        district: b?.address?.district ?? "",
        sector: b?.address?.sector ?? "",
        cell: b?.address?.cell ?? "",
        village: b?.address?.village ?? "",
        disbursementDate: loan.disbursementDate!,
        disbursedAmount: Number(loan.disbursedAmount),
        maturityDate: loan.agreedMaturityDate!,
        amountRepaid: Math.round(amountRepaid * 100) / 100,
        loanBalanceOutstanding: Math.round(loanBalance * 100) / 100,
        securitySavings: Math.round(securitySavings * 100) / 100,
        amountWrittenOff: Math.round(amountWrittenOff * 100) / 100,
        dateOfWriteOff: writeOffDate,
        recoveriesOnWrittenOff: Math.round(recoveries * 100) / 100,
        remainingBalanceToRecover: Math.round(remaining * 100) / 100,
        daysInArrears: loan.daysInArrears,
        loanId: loan.loanId,
        loanStatus: loan.status,
      };
    });

    // Summary
    const totalWrittenOff = entries.reduce((s, e) => s + e.amountWrittenOff, 0);
    const totalRemaining = entries.reduce((s, e) => s + e.remainingBalanceToRecover, 0);
    const totalRecoveries = entries.reduce((s, e) => s + e.recoveriesOnWrittenOff, 0);
    const byGender: Record<string, number> = {};
    const byDistrict: Record<string, number> = {};
    const byRelationship: Record<string, number> = {};
    for (const e of entries) {
      byGender[e.gender] = (byGender[e.gender] ?? 0) + 1;
      byDistrict[e.district || "Unknown"] = (byDistrict[e.district || "Unknown"] ?? 0) + 1;
      byRelationship[e.relationshipWithNDFSP] = (byRelationship[e.relationshipWithNDFSP] ?? 0) + 1;
    }
    const avgAge = entries.length ? entries.reduce((s, e) => s + e.age, 0) / entries.length : 0;
    const avgDays = entries.length ? entries.reduce((s, e) => s + e.daysInArrears, 0) / entries.length : 0;
    const recoveryRate = totalWrittenOff > 0 ? (totalRecoveries / totalWrittenOff) * 100 : 0;

    return {
      title: "Written Off Loans - Individuals (1 year in loss)",
      description: "Loans with 720+ days in arrears",
      criteria: "Loans with 720+ consecutive days in arrears (approximately 2 financial years)",
      reportDate: new Date(),
      totalLoans: entries.length,
      totalAmountWrittenOff: Math.round(totalWrittenOff * 100) / 100,
      totalRemainingBalance: Math.round(totalRemaining * 100) / 100,
      loans: entries,
      summary: {
        byGender, byDistrict, byRelationship,
        averageAge: Math.round(avgAge * 100) / 100,
        averageDaysInArrears: Math.round(avgDays),
        recoveryRate: Math.round(recoveryRate * 100) / 100,
      },
    };
  }

private _buildClassReport(
  loanClass: LoanClass,
  classLoans: Loan[],
  allLoansProv: Map<number, ReturnType<LoanClassificationService["_provisions"]>>,
  dateRange?: { startDate?: string; endDate?: string }
) {
  const summary = {
    classCount: classLoans.length,
    totalOutstanding: 0,
    totalProvisionsRequired: 0,
    averageDaysOverdue: 0,
    collateralCoverage: 0,
    totalDisbursed: 0,
    averageLoanSize: 0,
  };

  // First pass: calculate summary totals
  classLoans.forEach(loan => {
    const prov = allLoansProv.get(loan.id)!;
    const outstanding = this._outstanding(loan);
    const daysOverdue = prov.daysOverdue;

    summary.totalOutstanding += outstanding;
    summary.totalProvisionsRequired += prov.provisionRequired;
    summary.averageDaysOverdue += daysOverdue;
    summary.totalDisbursed += Number(loan.disbursedAmount || 0);
  });

  // Calculate averages
  summary.averageDaysOverdue = classLoans.length
    ? Math.round((summary.averageDaysOverdue / classLoans.length) * 100) / 100 : 0;
  summary.averageLoanSize = classLoans.length
    ? Math.round((summary.totalDisbursed / classLoans.length) * 100) / 100 : 0;

  const totalCollateral = classLoans.reduce((s, l) => s + this._collateral(l), 0);
  summary.collateralCoverage = summary.totalOutstanding > 0
    ? Math.round((totalCollateral / summary.totalOutstanding) * 10_000) / 100 : 0;

  // Second pass: build loan details with provision data from the map
  const loanDetails = classLoans.map(loan => {
    const prov = allLoansProv.get(loan.id)!;
    const outstanding = this._outstanding(loan);
    const collateral = this._collateral(loan);
    const daysOverdue = prov.daysOverdue;

    const outstandingPrincipal = parseFloat(loan.outstandingPrincipal?.toString() || '0');
    const principalRepaid = loan.transactions
      ?.filter(t => t.isActive)
      .reduce((sum, t) => sum + (parseFloat(t.principalPaid?.toString() || '0')), 0) || 0;
    
    const totalInstallments = loan.totalNumberOfInstallments || 0;
    const paidInstallments = loan.repaymentSchedules?.filter(s => s.isPaid).length || 0;
    const outstandingInstallments = totalInstallments - paidInstallments;
    const accruedInterest = parseFloat(loan.accruedInterestToDate?.toString() || '0');
    const netAmountDue = outstandingPrincipal + accruedInterest;
    
    let maturityDate = loan.agreedMaturityDate;
    if (!maturityDate && loan.disbursementDate && loan.termInMonths) {
      const maturityCalc = new Date(loan.disbursementDate);
      maturityCalc.setMonth(maturityCalc.getMonth() + loan.termInMonths);
      maturityDate = maturityCalc;
    }

    const paidSchedules = loan.repaymentSchedules?.filter(s => s.isPaid).length ?? 0;
    const overdueSchedules = loan.repaymentSchedules?.filter(s => !s.isPaid && new Date(s.dueDate) < new Date()).length ?? 0;
    const txns = loan.transactions?.filter(t => t.isActive) ?? [];

    // Create provision details from the prov object
    const provisionDetails = {
      previousProvisionsHeld: prov.previous,
      currentProvisionRequired: prov.provisionRequired,
      additionalProvisionsNeeded: prov.additional,
      provisionChangeStatus: prov.additional > 0 ? "INCREASE_REQUIRED" : 
                             prov.additional < 0 ? "PROVISION_RELEASE" : "NO_CHANGE"
    };

    return {
      loanId: loan.loanId,
      status: loan.status,
      disbursedAmount: Math.round(Number(loan.disbursedAmount || 0) * 100) / 100,
      outstandingPrincipal: Math.round(outstandingPrincipal * 100) / 100,
      principalRepaid: Math.round(principalRepaid * 100) / 100,
      accruedInterest: Math.round(accruedInterest * 100) / 100,
      netAmountDue: Math.round(netAmountDue * 100) / 100,
      totalAmountToBeRepaid: Math.round(Number(loan.totalAmountToBeRepaid || 0) * 100) / 100,
      monthlyInstallmentAmount: Math.round(Number(loan.monthlyInstallmentAmount || 0) * 100) / 100,
      termInMonths: loan.termInMonths,
      annualInterestRate: loan.annualInterestRate ? parseFloat(loan.annualInterestRate.toString()) : 0,
      interestMethod: loan.interestMethod,
      repaymentFrequency: loan.repaymentFrequency,
      gracePeriodMonths: loan.gracePeriodMonths,
      totalNumberOfInstallments: totalInstallments,
      disbursementDate: loan.disbursementDate,
      agreedMaturityDate: maturityDate,
      agreedFirstPaymentDate: loan.agreedFirstPaymentDate,
      purposeOfLoan: loan.purposeOfLoan,
      branchName: loan.branchName,
      loanOfficer: loan.loanOfficer,
      
      borrowerInfo: {
        borrowerId: loan.borrower?.borrowerId,
        fullName: loan.borrower?.fullName ?? "Unknown",
        firstName: loan.borrower?.firstName,
        lastName: loan.borrower?.lastName,
        middleName: loan.borrower?.middleName,
        nationalId: loan.borrower?.nationalId,
        gender: loan.borrower?.gender,
        dateOfBirth: loan.borrower?.dateOfBirth,
        age: loan.borrower?.age,
        maritalStatus: loan.borrower?.maritalStatus,
        primaryPhone: loan.borrower?.primaryPhone,
        alternativePhone: loan.borrower?.alternativePhone,
        email: loan.borrower?.email,
        address: loan.borrower?.address,
        occupation: loan.borrower?.occupation,
        monthlyIncome: loan.borrower?.monthlyIncome,
        incomeSource: loan.borrower?.incomeSource,
        relationshipWithNDFSP: loan.borrower?.relationshipWithNDFSP,
        previousLoansPaidOnTime: loan.borrower?.previousLoansPaidOnTime,
        creditScore: loan.borrower?.getCreditScore?.(),
        isEligibleForLoan: loan.borrower?.isEligibleForLoan?.(),
      },
      
      collaterals: loan.collaterals?.map(c => ({
        collateralId: c.collateralId,
        collateralType: c.collateralType,
        description: c.description,
        originalValue: Math.round(Number(c.collateralValue || 0) * 100) / 100,
        effectiveValue: Math.round(Number(c.effectiveValue ?? 0) * 100) / 100,
        valuationPercentage: c.getValuationPercentage() * 100,
        valuationDate: c.valuationDate,
        valuedBy: c.valuedBy,
        needsRevaluation: c.needsRevaluation(),
        valuationAge: c.getValuationAge(),
        guarantorName: c.guarantorName,
        guarantorPhone: c.guarantorPhone,
        notes: c.notes,
        isActive: c.isActive,
        location: c.location,
        ownerInfo: c.ownerInfo,
        upiNumber: c.upiNumber,
      })) ?? [],
      
      collateralSummary: {
        totalOriginalValue: Math.round(loan.collaterals?.reduce((sum, c) => sum + (Number(c.collateralValue) || 0), 0) || 0),
        totalEffectiveValue: Math.round(collateral * 100) / 100,
        collateralCount: loan.collaterals?.length ?? 0,
        collateralTypes: loan.collaterals?.map(c => c.collateralType) ?? [],
        needsRevaluationCount: loan.collaterals?.filter(c => c.needsRevaluation()).length ?? 0,
        coverageRatio: outstanding > 0 ? Math.round((collateral / outstanding) * 10000) / 100 : 0,
      },
      
      repaymentScheduleSummary: {
        totalInstallments,
        paidInstallments,
        unpaidInstallments: outstandingInstallments,
        overdueInstallments: overdueSchedules,
        nextPaymentDue: loan.repaymentSchedules
          ?.filter(s => !s.isPaid && new Date(s.dueDate) >= new Date())
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]?.dueDate ?? null,
        nextPaymentAmount: loan.monthlyInstallmentAmount ? parseFloat(loan.monthlyInstallmentAmount.toString()) : 0,
      },
      
      paymentHistory: {
        totalPayments: txns.length,
        totalAmountPaid: Math.round(txns.reduce((s, t) => s + Number(t.amountPaid || 0), 0) * 100) / 100,
        totalPrincipalPaid: Math.round(principalRepaid * 100) / 100,
        totalInterestPaid: Math.round(txns.reduce((s, t) => s + Number(t.interestPaid || 0), 0) * 100) / 100,
        lastPaymentDate: txns.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]?.paymentDate ?? null,
        lastPaymentAmount: txns.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]?.amountPaid ?? 0,
      },
      
      financialMetrics: {
        outstandingBalance: Math.round(outstanding * 100) / 100,
        outstandingPrincipal: Math.round(outstandingPrincipal * 100) / 100,
        principalRepaid: Math.round(principalRepaid * 100) / 100,
        accruedInterest: Math.round(accruedInterest * 100) / 100,
        totalAmountToBeRepaid: Math.round(Number(loan.totalAmountToBeRepaid || 0) * 100) / 100,
        monthlyInstallmentAmount: Math.round(Number(loan.monthlyInstallmentAmount || 0) * 100) / 100,
        principalRecoveryRate: Number(loan.disbursedAmount) > 0
          ? Math.round((principalRepaid / Number(loan.disbursedAmount)) * 10000) / 100
          : 0,
        netAmountDue: Math.round(netAmountDue * 100) / 100,
      },
      
      riskAssessment: {
        daysOverdue,
        daysInArrears: loan.daysInArrears ?? 0,
        currentClassification: loanClass,
        collateralCoverageRatio: outstanding > 0
          ? Math.round((collateral / outstanding) * 10000) / 100 : 0,
        netExposure: Math.round(prov.netExposure * 100) / 100,
        provisionRequired: Math.round(prov.provisionRequired * 100) / 100,
        provisioningRate: prov.rate,
        previousProvisionsHeld: Math.round(prov.previous * 100) / 100,
        additionalProvisionsThisPeriod: Math.round(prov.additional * 100) / 100,
        isOverdue: daysOverdue > 0,
        riskLevel: daysOverdue === 0 ? "LOW" : daysOverdue <= 30 ? "MODERATE" : daysOverdue <= 90 ? "HIGH" : "CRITICAL",
        isAdequatelyCollateralized: loan.isAdequatelyCollateralized?.() ?? false,
        classificationCategory: loan.getClassificationCategory ? loan.getClassificationCategory() : null,
      },
      
      // ✅ FIX: Use provisionDetails created from the prov object
      provisionDetails: provisionDetails,
      
      metadata: {
        createdAt: loan.createdAt,
        updatedAt: loan.updatedAt,
        isActive: loan.isActive,
        notes: loan.notes,
      },
    };
  });

  // Round summary values
  summary.totalOutstanding = Math.round(summary.totalOutstanding * 100) / 100;
  summary.totalProvisionsRequired = Math.round(summary.totalProvisionsRequired * 100) / 100;
  summary.totalDisbursed = Math.round(summary.totalDisbursed * 100) / 100;

  // Calculate provision summary using the prov data directly
  let totalPrevious = 0;
  let totalAdditional = 0;
  
  classLoans.forEach(loan => {
    const prov = allLoansProv.get(loan.id)!;
    totalPrevious += prov.previous;
    totalAdditional += prov.additional;
  });

  const provisionSummary = {
    totalPreviousProvisions: Math.round(totalPrevious * 100) / 100,
    totalCurrentRequired: summary.totalProvisionsRequired,
    totalAdditionalNeeded: Math.round(totalAdditional * 100) / 100,
    provisionChangeDirection: totalAdditional > 0 ? "INCREASING" : totalAdditional < 0 ? "DECREASING" : "STABLE"
  };

  // Movements object
  const movements = {
    movements: [],
    summary: {
      totalInClass: classLoans.length,
      enteredThisClass: 0,
      exitedThisClass: 0,
      netChange: 0,
      trendIndicator: "STABLE",
      dateRange: {
        from: dateRange?.startDate || null,
        to: dateRange?.endDate || null
      }
    },
    exitedLoans: []
  };

  // Insights object
  const insights = {
    portfolioHealth: {
      averageCollateralCoverage: summary.collateralCoverage,
      averageDaysOverdue: summary.averageDaysOverdue,
      totalAtRisk: summary.totalOutstanding,
      provisionsNeeded: summary.totalProvisionsRequired
    },
    borrowerProfiles: {
      totalBorrowers: new Set(classLoans.map(l => l.borrowerId)).size
    },
    recommendations: summary.collateralCoverage < 80
      ? ["⚠️ Low collateral coverage detected. Consider requesting additional collateral."]
      : []
  };

  return {
    summary,
    loanDetails,
    movements,
    insights,
    provisionSummary,
    reportMetadata: {
      classification: loanClass
    }
  };
}

  async getComprehensiveClassificationReport(
    organizationId: number,
    dateRange?: { startDate?: string; endDate?: string },
    options?: { includeMovements?: boolean; includeInsights?: boolean }
  ): Promise<any> {
    try {
      // ========================================
      // STEP 1: Define allowed statuses - ONLY ACTIVE LOANS
      // ========================================
      const ALLOWED_STATUSES = [
        LoanStatus.DISBURSED,
        LoanStatus.PERFORMING,
        LoanStatus.WATCH,
        LoanStatus.SUBSTANDARD,
        LoanStatus.DOUBTFUL,
        LoanStatus.LOSS
      ];

      // ========================================
      // STEP 2: Build query with proper relations
      // ========================================
      const queryBuilder = this.loanRepository
        .createQueryBuilder("loan")
        .leftJoinAndSelect("loan.borrower", "borrower")
        .leftJoinAndSelect("loan.collaterals", "collaterals")
        .leftJoinAndSelect("loan.repaymentSchedules", "repaymentSchedules")
        .leftJoinAndSelect("loan.transactions", "transactions")
        .leftJoinAndSelect("loan.classifications", "classifications")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.isActive = :isActive", { isActive: true })
        .andWhere("loan.status IN (:...allowedStatuses)", {
          allowedStatuses: ALLOWED_STATUSES
        });

      // Apply date range filters if provided
      if (dateRange?.startDate) {
        queryBuilder.andWhere("loan.disbursementDate >= :startDate", {
          startDate: new Date(dateRange.startDate)
        });
      }
      if (dateRange?.endDate) {
        queryBuilder.andWhere("loan.disbursementDate <= :endDate", {
          endDate: new Date(dateRange.endDate)
        });
      }

      // Execute query
      const loans = await queryBuilder.getMany();

      if (!loans.length) {
        return {
          success: true,
          message: "No active loans found for organization",
          data: this.createEmptyComprehensiveReport(organizationId, dateRange),
        };
      }

      // ========================================
      // STEP 3: Compute provisions for each loan IN-MEMORY
      // ========================================
      const allLoansProv = new Map<number, ReturnType<LoanClassificationService["_provisions"]>>();
      const loansByClass: Record<LoanClass, Loan[]> = {
        [LoanClass.NORMAL]: [],
        [LoanClass.WATCH]: [],
        [LoanClass.SUBSTANDARD]: [],
        [LoanClass.DOUBTFUL]: [],
        [LoanClass.LOSS]: [],
      };

      let totalPrev = 0, totalRequired = 0, totalAdditional = 0;

      for (const loan of loans) {
        const prov = this._provisions(loan);
        allLoansProv.set(loan.id, prov);
        loansByClass[prov.loanClass].push(loan);
        totalPrev += prov.previous;
        totalRequired += prov.provisionRequired;
        totalAdditional += prov.additional;
      }

      // ========================================
      // STEP 4: Build per-class reports
      // ========================================
      const classificationReports: Record<string, any> = {};
      for (const loanClass of Object.values(LoanClass)) {
        classificationReports[loanClass] = this._buildClassReport(
          loanClass,
          loansByClass[loanClass],
          allLoansProv,
          dateRange
        );
      }

      // ========================================
      // STEP 5: Aggregate overall summary
      // ========================================
      const totalPortfolio = loans.reduce((s, l) => s + this._outstanding(l), 0);
      const totalDisbursed = loans.reduce((s, l) => s + Number(l.disbursedAmount || 0), 0);
      const totalCollateralVal = loans.reduce((s, l) => s + this._collateral(l), 0);

      const avgCollateralCov = totalPortfolio > 0
        ? Math.round((totalCollateralVal / totalPortfolio) * 10_000) / 100 : 0;

      // Portfolio health score (weighted by class)
      const weights = {
        [LoanClass.NORMAL]: 100,
        [LoanClass.WATCH]: 75,
        [LoanClass.SUBSTANDARD]: 50,
        [LoanClass.DOUBTFUL]: 25,
        [LoanClass.LOSS]: 0
      };

      const weightedSum = Object.values(LoanClass).reduce(
        (s, lc) => s + loansByClass[lc].length * weights[lc], 0
      );

      const portfolioHealthScore = loans.length
        ? Math.round((weightedSum / loans.length) * 100) / 100 : 0;

      const overallSummary = {
        totalPortfolio: Math.round(totalPortfolio * 100) / 100,
        totalOutstandingPrincipal: Math.round(loans.reduce((s, l) => s + this._outstanding(l), 0) * 100) / 100,
        totalPrincipalRepaid: Math.round(loans.reduce((s, l) => {
          const repaid = l.transactions
            ?.filter(t => t.isActive)
            .reduce((sum, t) => sum + (parseFloat(t.principalPaid?.toString() || '0')), 0) || 0;
          return s + repaid;
        }, 0) * 100) / 100,
        totalProvisionsRequired: Math.round(totalRequired * 100) / 100,
        averageCollateralCoverage: avgCollateralCov,
        portfolioHealthScore,
        totalDisbursed: Math.round(totalDisbursed * 100) / 100,
        averageLoanSize: loans.length ? Math.round((totalDisbursed / loans.length) * 100) / 100 : 0,
        totalCollateralValue: Math.round(totalCollateralVal * 100) / 100,
        netPortfolioValue: Math.round((totalPortfolio - totalRequired) * 100) / 100,
        provisionTracking: {
          totalPreviousProvisions: Math.round(totalPrev * 100) / 100,
          totalCurrentRequired: Math.round(totalRequired * 100) / 100,
          totalAdditionalProvisions: Math.round(totalAdditional * 100) / 100,
          provisionAdequacyRatio: totalRequired > 0
            ? Math.round((totalPrev / totalRequired) * 10_000) / 100 : 100,
          provisionShortfall: Math.max(0, Math.round((totalRequired - totalPrev) * 100) / 100),
          portfolioProvisionTrend: totalAdditional > 0 ? "DETERIORATING"
            : totalAdditional < 0 ? "IMPROVING" : "STABLE",
        },
        summaryTotals: {
          totalInstallments: loans.reduce((s, l) => s + (l.totalNumberOfInstallments || 0), 0),
          totalPaidInstallments: loans.reduce((s, l) => {
            return s + (l.repaymentSchedules?.filter(sch => sch.isPaid).length || 0);
          }, 0),
          totalOutstandingInstallments: loans.reduce((s, l) => {
            return s + ((l.totalNumberOfInstallments || 0) - (l.repaymentSchedules?.filter(sch => sch.isPaid).length || 0));
          }, 0),
        },
      };

      // ========================================
      // STEP 6: Aggregated insights
      // ========================================
      const riskDist: Record<LoanClass, number> = {} as any;
      const byClass: Record<string, any> = {};

      for (const lc of Object.values(LoanClass)) {
        const count = loansByClass[lc].length;
        const pct = loans.length ? Math.round((count / loans.length) * 10_000) / 100 : 0;
        const amt = loansByClass[lc].reduce((s, l) => s + this._outstanding(l), 0);
        riskDist[lc] = pct;
        byClass[lc] = { count, percentage: pct, amount: Math.round(amt * 100) / 100 };
      }

      const aggInsights = {
        riskDistribution: riskDist,
        provisioningAdequacy: totalRequired > 0
          ? Math.round((totalPrev / totalRequired) * 10_000) / 100 : 100,
        recommendations: this.generateComprehensiveRecommendations(riskDist, overallSummary, loans.length),
        portfolioComposition: {
          byClass,
          byRiskLevel: {
            LOW: riskDist[LoanClass.NORMAL] || 0,
            MODERATE: riskDist[LoanClass.WATCH] || 0,
            HIGH: (riskDist[LoanClass.SUBSTANDARD] || 0) + (riskDist[LoanClass.DOUBTFUL] || 0),
            CRITICAL: riskDist[LoanClass.LOSS] || 0,
          },
        },
        provisionInsights: {
          loansRequiringAdditionalProvisions: loans.filter(l => allLoansProv.get(l.id)!.additional > 0).length,
          loansWithProvisionRelease: loans.filter(l => allLoansProv.get(l.id)!.additional < 0).length,
          loansWithNoChange: loans.filter(l => Math.abs(allLoansProv.get(l.id)!.additional) < 0.01).length,
          recommendations: this.generateProvisionRecommendations(totalPrev, totalRequired, totalAdditional),
        },
        statusBreakdown: {
          disbursed: loans.filter(l => l.status === LoanStatus.DISBURSED).length,
          performing: loans.filter(l => l.status === LoanStatus.PERFORMING).length,
          watch: loans.filter(l => l.status === LoanStatus.WATCH).length,
          substandard: loans.filter(l => l.status === LoanStatus.SUBSTANDARD).length,
          doubtful: loans.filter(l => l.status === LoanStatus.DOUBTFUL).length,
          loss: loans.filter(l => l.status === LoanStatus.LOSS).length,
        }
      };

      // ========================================
      // STEP 7: Write-off report (only LOSS loans with 720+ days)
      // ========================================
      const writeOffReport = this._buildWriteOffReport(loans, dateRange);

      return {
        success: true,
        message: `Comprehensive classification report generated for ${loans.length} active loans`,
        data: {
          writeOffLoansReport: writeOffReport,
          reportMetadata: {
            generatedAt: new Date(),
            organizationId,
            dateRange: dateRange ?? {},
            totalLoans: loans.length,
            totalActiveLoans: loans.length,
            excludedLoans: 0, // We're only including active loans
            reportType: "COMPREHENSIVE",
          },
          overallSummary,
          classificationReports,
          aggregatedInsights: aggInsights,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to generate comprehensive classification report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      };
    }
  }


  private _maxDaysOverdue(loan: Loan): number {
    if (!loan.repaymentSchedules?.length) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let max = 0;
    for (const s of loan.repaymentSchedules) {
      if (s.isPaid || s.paymentStatus === "paid") continue;
      const due = new Date(s.dueDate);
      due.setHours(0, 0, 0, 0);
      if (due < today) {
        const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
        if (days > max) max = days;
      }
    }
    return max;
  }

  private _classFromDays(days: number): LoanClass {
    if (days <= 30) return LoanClass.NORMAL;
    if (days <= 90) return LoanClass.WATCH;
    if (days <= 180) return LoanClass.SUBSTANDARD;
    if (days <= 365) return LoanClass.DOUBTFUL;
    return LoanClass.LOSS;
  }

  private _rate(lc: LoanClass): number {
    return {
      [LoanClass.NORMAL]: 0.01,
      [LoanClass.WATCH]: 0.05,
      [LoanClass.SUBSTANDARD]: 0.25,
      [LoanClass.DOUBTFUL]: 0.50,
      [LoanClass.LOSS]: 1.00
    }[lc] ?? 0.01;
  }

  private _outstanding(loan: Loan): number {
    const paid = loan.transactions
      ?.filter(t => t.isActive)
      .reduce((s, t) => s + Number(t.principalPaid || 0), 0) ?? 0;
    return Math.max(0, Number(loan.disbursedAmount) - paid);
  }

  private _collateral(loan: Loan): number {
    return loan.collaterals?.reduce((s, c) => s + Number(c.effectiveValue ?? 0), 0) ?? 0;
  }

  private _netExposure(loan: Loan): number {
    return Math.max(0, this._outstanding(loan) - this._collateral(loan));
  }

  private _prevProvision(loan: Loan): number {
    if (!loan.classifications?.length) return 0;
    const sorted = [...loan.classifications].sort(
      (a, b) => new Date(b.classificationDate).getTime() - new Date(a.classificationDate).getTime()
    );
    return Number(sorted[0]?.provisionRequired ?? 0);
  }

  private _provisions(loan: Loan) {
    const daysOverdue = this._maxDaysOverdue(loan);
    const loanClass = this._classFromDays(daysOverdue);
    const rate = this._rate(loanClass);
    const netExposure = this._netExposure(loan);
    const provisionRequired = Math.round(netExposure * rate * 100) / 100;
    const previous = this._prevProvision(loan);
    const additional = Math.round((provisionRequired - previous) * 100) / 100;
    return { daysOverdue, loanClass, rate, netExposure, provisionRequired, previous, additional };
  }

  private determineProvisionTrend(loanDetails: any[]): string {
    const totalAdditional = loanDetails.reduce((sum, l) => {
      const current = l.riskAssessment?.provisionRequired || 0;
      const previous = l.riskAssessment?.previousProvisionsHeld || 0;
      return sum + (current - previous);
    }, 0);

    if (totalAdditional > 0) return 'INCREASING';
    if (totalAdditional < 0) return 'DECREASING';
    return 'STABLE';
  }

  /**
   * Calculate provision change percentage
   */
  private calculateProvisionChangePercentage(
    previous: number,
    current: number
  ): number {
    if (previous === 0 && current === 0) return 0;
    if (previous === 0) return 100;

    const change = ((current - previous) / previous) * 100;
    return Math.round(change * 100) / 100;
  }

  /**
   * Interpret provision change for user
   */
  private interpretProvisionChange(additionalProvisions: number): string {
    if (additionalProvisions > 0) {
      return `Loan has worsened. Add ${Math.abs(additionalProvisions).toFixed(2)} to provision fund.`;
    } else if (additionalProvisions < 0) {
      return `Loan has improved. Release ${Math.abs(additionalProvisions).toFixed(2)} from provision.`;
    } else {
      return 'No change in loan risk. Provision remains the same.';
    }
  }

  /**
   * Get previous provision for a loan
   */
  private getPreviousProvision(loan: Loan): number {
    if (!loan.classifications || loan.classifications.length === 0) return 0;

    const sorted = loan.classifications.sort((a, b) =>
      new Date(b.classificationDate).getTime() - new Date(a.classificationDate).getTime()
    );

    return parseFloat(String(sorted[0]?.provisionRequired || 0));
  }

  /**
   * Generate provision-specific recommendations
   */
  private generateProvisionRecommendations(
    previous: number,
    current: number,
    additional: number
  ): string[] {
    const recommendations: string[] = [];

    if (additional > 0) {
      recommendations.push(
        `⚠️ Portfolio risk increasing: Additional provisions of ${additional.toFixed(2)} required`
      );
    } else if (additional < 0) {
      recommendations.push(
        `✅ Portfolio improving: ${Math.abs(additional).toFixed(2)} in provisions can be released`
      );
    } else {
      recommendations.push(
        `✓ Portfolio risk stable: No provision adjustments needed`
      );
    }

    const adequacy = current > 0 ? (previous / current) * 100 : 100;
    if (adequacy < 80) {
      recommendations.push(
        `🚨 Critical: Provision adequacy at ${adequacy.toFixed(1)}%. Immediate funding required.`
      );
    } else if (adequacy < 100) {
      recommendations.push(
        `⚠️ Warning: Provision adequacy at ${adequacy.toFixed(1)}%. Consider increasing reserves.`
      );
    }

    return recommendations;
  }

  private generateComprehensiveRecommendations(
    riskDistribution: Record<LoanClass, number>,
    overallSummary: any,
    totalLoans: number
  ): string[] {
    const recommendations: string[] = [];

    // Portfolio quality assessment
    const normalPercentage = riskDistribution[LoanClass.NORMAL] || 0;
    if (normalPercentage >= 75) {
      recommendations.push(`✅ Excellent portfolio quality - ${normalPercentage.toFixed(1)}% in normal category`);
    } else if (normalPercentage >= 60) {
      recommendations.push(`✓ Good portfolio quality - ${normalPercentage.toFixed(1)}% in normal category`);
    } else if (normalPercentage >= 40) {
      recommendations.push(`⚠️ Portfolio quality declining - ${normalPercentage.toFixed(1)}% in normal category. Monitor closely.`);
    } else {
      recommendations.push(`🚨 Poor portfolio quality - only ${normalPercentage.toFixed(1)}% in normal category. Immediate action required.`);
    }

    // High-risk loans assessment
    const lossPercentage = riskDistribution[LoanClass.LOSS] || 0;
    if (lossPercentage > 5) {
      recommendations.push(`🚨 Critical: ${lossPercentage.toFixed(1)}% of loans in loss category - immediate collection action required`);
    } else if (lossPercentage > 2) {
      recommendations.push(`⚠️ Warning: ${lossPercentage.toFixed(1)}% of loans in loss category - review recovery strategies`);
    }

    // Collateral coverage assessment
    const collateralCoverage = overallSummary.averageCollateralCoverage;
    if (collateralCoverage < 80) {
      recommendations.push(`📉 Low collateral coverage (${collateralCoverage.toFixed(1)}%) - review security requirements`);
    } else if (collateralCoverage >= 120) {
      recommendations.push(`✅ Strong collateral coverage (${collateralCoverage.toFixed(1)}%) - portfolio well-secured`);
    }

    // Watch list growth
    const watchPercentage = riskDistribution[LoanClass.WATCH] || 0;
    if (watchPercentage > 15) {
      recommendations.push(`⚠️ High watch list (${watchPercentage.toFixed(1)}%) - implement proactive collection strategies`);
    }

    // Portfolio health score
    if (overallSummary.portfolioHealthScore >= 80) {
      recommendations.push(`✅ Strong portfolio health score: ${overallSummary.portfolioHealthScore.toFixed(1)}`);
    } else if (overallSummary.portfolioHealthScore >= 60) {
      recommendations.push(`⚠️ Moderate portfolio health score: ${overallSummary.portfolioHealthScore.toFixed(1)} - monitor trends`);
    } else {
      recommendations.push(`🚨 Low portfolio health score: ${overallSummary.portfolioHealthScore.toFixed(1)} - urgent review needed`);
    }

    return recommendations;
  }


  private generateAggregatedInsights(
    classificationReports: Record<string, any>,
    totalLoans: number,
    overallSummary: any
  ): any {
    // Calculate risk distribution
    const riskDistribution: Record<LoanClass, number> = {} as any;
    const portfolioComposition: any = {
      byClass: {},
      byRiskLevel: {}
    };

    Object.entries(classificationReports).forEach(([className, report]: [string, any]) => {
      if (report && report.summary) {
        const count = report.summary.classCount || 0;
        const amount = report.summary.totalOutstanding || 0;
        const percentage = totalLoans > 0
          ? Math.round((count / totalLoans) * 10000) / 100
          : 0;

        riskDistribution[className as LoanClass] = percentage;

        portfolioComposition.byClass[className] = {
          count,
          percentage,
          amount: Math.round(amount * 100) / 100
        };
      }
    });

    // Calculate risk levels
    portfolioComposition.byRiskLevel = {
      LOW: (riskDistribution[LoanClass.NORMAL] || 0),
      MODERATE: (riskDistribution[LoanClass.WATCH] || 0),
      HIGH: (riskDistribution[LoanClass.SUBSTANDARD] || 0) + (riskDistribution[LoanClass.DOUBTFUL] || 0),
      CRITICAL: (riskDistribution[LoanClass.LOSS] || 0)
    };

    // Calculate provisioning adequacy
    const provisioningAdequacy = overallSummary.totalProvisionsRequired > 0
      ? Math.round((overallSummary.totalProvisionsRequired / overallSummary.totalProvisionsRequired) * 10000) / 100
      : 100;

    // Generate recommendations
    const recommendations = this.generateComprehensiveRecommendations(
      riskDistribution,
      overallSummary,
      totalLoans
    );

    return {
      riskDistribution,
      provisioningAdequacy,
      recommendations,
      portfolioComposition
    };
  }

  private calculateOverallSummary(
    classificationReports: Record<string, any>,
    loans: Loan[]
  ): any {
    let totalPortfolio = 0;
    let totalProvisionsRequired = 0;
    let totalCollateralValue = 0;
    let totalDisbursed = 0;

    // Aggregate from classification reports
    Object.values(classificationReports).forEach((report: any) => {
      if (report && report.summary) {
        totalPortfolio += report.summary.totalOutstanding || 0;
        totalProvisionsRequired += report.summary.totalProvisionsRequired || 0;
        totalDisbursed += report.summary.totalDisbursed || 0;
      }
    });

    // Calculate total collateral from loans (using effective values with haircuts)
    totalCollateralValue = loans.reduce((sum, loan) => {
      return sum + (loan.totalCollateralValue || 0);
    }, 0);

    // Calculate metrics
    const averageCollateralCoverage = totalPortfolio > 0
      ? Math.round((totalCollateralValue / totalPortfolio) * 10000) / 100
      : 0;

    const portfolioHealthScore = this.calculatePortfolioHealthScore(
      classificationReports,
      loans.length
    );

    const averageLoanSize = loans.length > 0
      ? Math.round((totalDisbursed / loans.length) * 100) / 100
      : 0;

    const netPortfolioValue = Math.round((totalPortfolio - totalProvisionsRequired) * 100) / 100;

    return {
      totalPortfolio: Math.round(totalPortfolio * 100) / 100,
      totalProvisionsRequired: Math.round(totalProvisionsRequired * 100) / 100,
      averageCollateralCoverage,
      portfolioHealthScore,
      totalDisbursed: Math.round(totalDisbursed * 100) / 100,
      averageLoanSize,
      totalCollateralValue: Math.round(totalCollateralValue * 100) / 100,
      netPortfolioValue
    };
  }

  private calculatePortfolioHealthScore(
    classificationReports: Record<string, any>,
    totalLoans: number
  ): number {
    if (totalLoans === 0) return 0;

    const weights = {
      [LoanClass.NORMAL]: 100,
      [LoanClass.WATCH]: 75,
      [LoanClass.SUBSTANDARD]: 50,
      [LoanClass.DOUBTFUL]: 25,
      [LoanClass.LOSS]: 0
    };

    let weightedSum = 0;

    Object.entries(classificationReports).forEach(([className, report]: [string, any]) => {
      if (report && report.summary) {
        const count = report.summary.classCount || 0;
        const weight = weights[className as LoanClass] || 0;
        weightedSum += count * weight;
      }
    });

    return Math.round((weightedSum / totalLoans) * 100) / 100;
  }




  async generateWriteOffReport(
    organizationId: number,
    dateRange?: { startDate?: string; endDate?: string }
  ): Promise<{
    title: string;
    description: string;
    criteria: string;
    reportDate: Date;
    totalLoans: number;
    totalAmountWrittenOff: number;
    totalRemainingBalance: number;
    loans: WriteOffReportEntry[];
    summary: {
      byGender: Record<string, number>;
      byDistrict: Record<string, number>;
      byRelationship: Record<string, number>;
      averageAge: number;
      averageDaysInArrears: number;
      recoveryRate: number;
    };
  }> {

    // Build query for loans with 720+ days in arrears
    const queryBuilder = this.loanRepository
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .leftJoinAndSelect('loan.collaterals', 'collaterals')
      .leftJoinAndSelect('loan.transactions', 'transactions')
      .leftJoinAndSelect('loan.classifications', 'classifications')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.daysInArrears >= :minDays', { minDays: 720 });

    // Apply date range filters if provided
    if (dateRange?.startDate) {
      queryBuilder.andWhere('loan.disbursementDate >= :startDate', {
        startDate: new Date(dateRange.startDate)
      });
    }
    if (dateRange?.endDate) {
      queryBuilder.andWhere('loan.disbursementDate <= :endDate', {
        endDate: new Date(dateRange.endDate)
      });
    }

    const loans = await queryBuilder.getMany();


    // Transform loans into report entries
    const reportEntries: WriteOffReportEntry[] = loans.map(loan => {
      const borrower = loan.borrower;

      // Calculate age from date of birth
      const age = this.calculateAge(borrower.dateOfBirth);

      // Get total amount repaid from transactions
      const amountRepaid = loan.transactions
        ?.filter(t => t.isActive)
        .reduce((sum, t) => sum + (Number(t.amountPaid) || 0), 0) || 0;

      // Calculate loan balance outstanding
      const loanBalanceOutstanding =
        (Number(loan.outstandingPrincipal) || 0) +
        (Number(loan.accruedInterestToDate) || 0);

      // Get security savings (sum of collateral effective values)
      const securitySavings = loan.collaterals
        ?.filter(c => c.isActive)
        .reduce((sum, c) => sum + (Number(c.effectiveValue) || 0), 0) || 0;

      // FORMULA: Amount Written Off = Loan Balance Outstanding - Security Savings
      const amountWrittenOff = Math.max(0, loanBalanceOutstanding - securitySavings);

      // Get recoveries (payments made after write-off status)
      const recoveriesOnWrittenOff = this.calculateRecoveriesAfterWriteOff(loan);

      // FORMULA: Remaining Balance = Amount Written Off - Recoveries
      const remainingBalanceToRecover = Math.max(0, amountWrittenOff - recoveriesOnWrittenOff);

      // Get physical guarantee description
      const physicalGuarantee = loan.collaterals
        ?.map(c => `${c.collateralType}: ${c.description}`)
        .join('; ') || 'None';

      // Get date of write-off (when loan status changed to WRITTEN_OFF or LOSS)
      const dateOfWriteOff = this.getWriteOffDate(loan);

      return {
        // Column 1-4: Basic Info
        borrowerName: borrower.fullName,
        borrowerNationalId: borrower.nationalId,
        telephoneNumber: borrower.primaryPhone,
        accountNumber: loan.loanId,

        // Column 5-7: Demographics
        gender: borrower.gender,
        age,
        relationshipWithNDFSP: borrower.relationshipWithNDFSP,

        // Column 8-9: Interest Details
        annualInterestRate: Number(loan.annualInterestRate),
        interestCalculationMethod: loan.interestMethod,

        // Column 10: Collateral
        physicalGuarantee,

        // Column 11-14: Location
        district: borrower.address?.district || '',
        sector: borrower.address?.sector || '',
        cell: borrower.address?.cell || '',
        village: borrower.address?.village || '',

        // Column 15-17: Loan Timeline
        disbursementDate: loan.disbursementDate,
        disbursedAmount: Number(loan.disbursedAmount),
        maturityDate: loan.agreedMaturityDate,

        // Column 18-20: Payment Status
        amountRepaid: Math.round(amountRepaid * 100) / 100,
        loanBalanceOutstanding: Math.round(loanBalanceOutstanding * 100) / 100,
        securitySavings: Math.round(securitySavings * 100) / 100,

        // Column 21: KEY CALCULATION
        amountWrittenOff: Math.round(amountWrittenOff * 100) / 100,

        // Column 22-23: Write-Off Details
        dateOfWriteOff,
        recoveriesOnWrittenOff: Math.round(recoveriesOnWrittenOff * 100) / 100,

        // Column 24: FINAL CALCULATION
        remainingBalanceToRecover: Math.round(remainingBalanceToRecover * 100) / 100,

        // Metadata
        daysInArrears: loan.daysInArrears,
        loanId: loan.loanId,
        loanStatus: loan.status
      };
    });

    // Calculate summary statistics
    const summary = this.calculateWriteOffSummary(reportEntries);



    return {
      title: "Written Off Loans - Individuals (1 year in loss)",
      description: "This report lists all individual loans that have been in 'loss' status for one year, defined as being 720 days in arrears or more.",
      criteria: "Loans with 720+ consecutive days in arrears (approximately 2 financial years)",
      reportDate: new Date(),
      totalLoans: reportEntries.length,
      totalAmountWrittenOff: summary.totalAmountWrittenOff,
      totalRemainingBalance: summary.totalRemainingBalance,
      loans: reportEntries,
      summary: {
        byGender: summary.byGender,
        byDistrict: summary.byDistrict,
        byRelationship: summary.byRelationship,
        averageAge: summary.averageAge,
        averageDaysInArrears: summary.averageDaysInArrears,
        recoveryRate: summary.recoveryRate
      }
    };
  }

  /**
   * HELPER: Calculate age from date of birth
   */
  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * HELPER: Calculate recoveries made after write-off
   */
  private calculateRecoveriesAfterWriteOff(loan: Loan): number {
    if (!loan.transactions || loan.transactions.length === 0) {
      return 0;
    }

    // Find when loan was written off
    const writeOffDate = this.getWriteOffDate(loan);
    if (!writeOffDate) {
      return 0;
    }

    // Sum payments made after write-off date
    return loan.transactions
      .filter(t =>
        t.isActive &&
        new Date(t.paymentDate) > writeOffDate
      )
      .reduce((sum, t) => sum + (Number(t.amountPaid) || 0), 0);
  }

  /**
   * HELPER: Get the date when loan was written off
   */
  private getWriteOffDate(loan: Loan): Date | null {
    // Check if there's a classification record for LOSS status with 720+ days
    const lossClassification = loan.classifications
      ?.filter(c =>
        c.loanClass === LoanClass.LOSS &&
        c.daysInArrears >= 720
      )
      .sort((a, b) =>
        new Date(a.classificationDate).getTime() -
        new Date(b.classificationDate).getTime()
      )[0];

    if (lossClassification) {
      return lossClassification.classificationDate;
    }

    // Fallback: If loan status is WRITTEN_OFF, use when it reached 720 days
    if (loan.status === LoanStatus.WRITTEN_OFF || loan.status === LoanStatus.LOSS) {
      // Estimate based on current days in arrears
      const daysOverThreshold = loan.daysInArrears - 720;
      const writeOffDate = new Date();
      writeOffDate.setDate(writeOffDate.getDate() - daysOverThreshold);
      return writeOffDate;
    }

    return null;
  }

  /**
   * HELPER: Calculate summary statistics
   */
  private calculateWriteOffSummary(entries: WriteOffReportEntry[]): {
    totalAmountWrittenOff: number;
    totalRemainingBalance: number;
    byGender: Record<string, number>;
    byDistrict: Record<string, number>;
    byRelationship: Record<string, number>;
    averageAge: number;
    averageDaysInArrears: number;
    recoveryRate: number;
  } {
    if (entries.length === 0) {
      return {
        totalAmountWrittenOff: 0,
        totalRemainingBalance: 0,
        byGender: {},
        byDistrict: {},
        byRelationship: {},
        averageAge: 0,
        averageDaysInArrears: 0,
        recoveryRate: 0
      };
    }

    const totalAmountWrittenOff = entries.reduce((sum, e) =>
      sum + e.amountWrittenOff, 0
    );

    const totalRemainingBalance = entries.reduce((sum, e) =>
      sum + e.remainingBalanceToRecover, 0
    );

    const totalRecoveries = entries.reduce((sum, e) =>
      sum + e.recoveriesOnWrittenOff, 0
    );

    // Group by gender
    const byGender: Record<string, number> = {};
    entries.forEach(e => {
      byGender[e.gender] = (byGender[e.gender] || 0) + 1;
    });

    // Group by district
    const byDistrict: Record<string, number> = {};
    entries.forEach(e => {
      const district = e.district || 'Unknown';
      byDistrict[district] = (byDistrict[district] || 0) + 1;
    });

    // Group by relationship
    const byRelationship: Record<string, number> = {};
    entries.forEach(e => {
      byRelationship[e.relationshipWithNDFSP] =
        (byRelationship[e.relationshipWithNDFSP] || 0) + 1;
    });

    const averageAge = entries.reduce((sum, e) => sum + e.age, 0) / entries.length;

    const averageDaysInArrears = entries.reduce((sum, e) =>
      sum + e.daysInArrears, 0
    ) / entries.length;

    const recoveryRate = totalAmountWrittenOff > 0
      ? (totalRecoveries / totalAmountWrittenOff) * 100
      : 0;

    return {
      totalAmountWrittenOff: Math.round(totalAmountWrittenOff * 100) / 100,
      totalRemainingBalance: Math.round(totalRemainingBalance * 100) / 100,
      byGender,
      byDistrict,
      byRelationship,
      averageAge: Math.round(averageAge * 100) / 100,
      averageDaysInArrears: Math.round(averageDaysInArrears),
      recoveryRate: Math.round(recoveryRate * 100) / 100
    };
  }
}