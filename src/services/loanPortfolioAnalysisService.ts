import { Repository } from "typeorm";
import { Loan, LoanStatus } from "../entities/Loan";
import { LoanCollateral } from "../entities/LoanCollateral";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import { LoanClassification } from "../entities/LoanClassification";
import dbConnection from "../db";

interface PortfolioFilters {
  loanStatus?: string;
  economicSector?: string;
  businessType?: string;
  branchName?: string;
  loanOfficer?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  daysOverdueMin?: number;
  daysOverdueMax?: number;
}

export class LoanPortfolioAnalysisService {
  private loanRepository: Repository<Loan>;
  private collateralRepository: Repository<LoanCollateral>;
  private scheduleRepository: Repository<RepaymentSchedule>;
  private classificationRepository: Repository<LoanClassification>;

  constructor() {
    this.loanRepository = dbConnection.getRepository(Loan);
    this.collateralRepository = dbConnection.getRepository(LoanCollateral);
    this.scheduleRepository = dbConnection.getRepository(RepaymentSchedule);
    this.classificationRepository = dbConnection.getRepository(LoanClassification);
  }

  async getPortfolioAnalysis(organizationId: number, filters: PortfolioFilters) {
    try {
      console.log('🔍 Fetching loan portfolio data...');

      const queryBuilder = this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.collaterals', 'collaterals')
        .leftJoinAndSelect('loan.repaymentSchedules', 'schedules')
        .leftJoinAndSelect('loan.transactions', 'transactions')
        .leftJoinAndSelect('loan.classifications', 'classifications')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere('loan.isActive = :isActive', { isActive: true });

      // Apply filters
      if (filters.loanStatus) {
        queryBuilder.andWhere('loan.status = :status', { status: filters.loanStatus });
      }
      if (filters.economicSector) {
        queryBuilder.andWhere('loan.economicSector = :sector', { sector: filters.economicSector });
      }
      if (filters.businessType) {
        queryBuilder.andWhere('loan.businessType = :businessType', { businessType: filters.businessType });
      }
      if (filters.branchName) {
        queryBuilder.andWhere('loan.branchName = :branchName', { branchName: filters.branchName });
      }
      if (filters.loanOfficer) {
        queryBuilder.andWhere('loan.loanOfficer = :loanOfficer', { loanOfficer: filters.loanOfficer });
      }
      if (filters.dateFrom) {
        queryBuilder.andWhere('loan.disbursementDate >= :dateFrom', { dateFrom: filters.dateFrom });
      }
      if (filters.dateTo) {
        queryBuilder.andWhere('loan.disbursementDate <= :dateTo', { dateTo: filters.dateTo });
      }
      if (filters.minAmount) {
        queryBuilder.andWhere('loan.disbursedAmount >= :minAmount', { minAmount: filters.minAmount });
      }
      if (filters.maxAmount) {
        queryBuilder.andWhere('loan.disbursedAmount <= :maxAmount', { maxAmount: filters.maxAmount });
      }
      if (filters.daysOverdueMin !== undefined) {
        queryBuilder.andWhere('loan.daysInArrears >= :daysMin', { daysMin: filters.daysOverdueMin });
      }
      if (filters.daysOverdueMax !== undefined) {
        queryBuilder.andWhere('loan.daysInArrears <= :daysMax', { daysMax: filters.daysOverdueMax });
      }

      const loans = await queryBuilder.getMany();
      console.log(`✅ Retrieved ${loans.length} loans for analysis`);

      // Calculate comprehensive metrics
      const metrics = this.calculatePortfolioMetrics(loans);

      return {
        success: true,
        message: "Portfolio analysis completed successfully",
        data: {
          summary: metrics.summary,
          loanToValueAnalysis: metrics.ltvAnalysis,
          nonPerformingLoansAnalysis: metrics.nplAnalysis,
          averageLoanSize: metrics.averageLoanSize,
          loanMaturityDistribution: metrics.maturityDistribution,
          loanLossReserveAnalysis: metrics.lossReserveAnalysis,
          portfolioRiskAnalysis: metrics.riskAnalysis,
          collateralAnalysis: metrics.collateralAnalysis,
          demographicAnalysis: metrics.demographicAnalysis,
          performanceByOfficer: metrics.officerPerformance,
          sectorDistribution: metrics.sectorDistribution,
          filteredLoans: loans.map(loan => this.formatLoanForAnalysis(loan)),
          appliedFilters: filters,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: any) {
      console.error('❌ Portfolio analysis error:', error);
      return {
        success: false,
        message: `Failed to analyze portfolio: ${error.message}`
      };
    }
  }

  private calculatePortfolioMetrics(loans: Loan[]) {
    const totalLoans = loans.length;
    const totalDisbursed = loans.reduce((sum, loan) => sum + Number(loan.disbursedAmount || 0), 0);
    const totalOutstanding = loans.reduce((sum, loan) => sum + Number(loan.outstandingPrincipal || 0), 0);
    const totalCollateralValue = loans.reduce((sum, loan) => sum + loan.totalCollateralValue, 0);

    // KEY METRICS
    const ltvAnalysis = this.calculateLTVRatio(loans, totalOutstanding, totalCollateralValue);
    const nplAnalysis = this.calculateNPLRatio(loans, totalOutstanding); // ✅ FIXED: Use totalOutstanding
    const averageLoanSize = this.calculateAverageLoanSize(totalDisbursed, totalLoans);
    const maturityDistribution = this.calculateMaturityDistribution(loans);
    const lossReserveAnalysis = this.calculateLoanLossReserve(loans, totalOutstanding); // ✅ FIXED: Use totalOutstanding

    // Additional analyses
    const riskAnalysis = this.calculateRiskAnalysis(loans);
    const collateralAnalysis = this.calculateCollateralAnalysis(loans);
    const demographicAnalysis = this.calculateDemographicAnalysis(loans);
    const officerPerformance = this.calculateOfficerPerformance(loans);
    const sectorDistribution = this.calculateSectorDistribution(loans);

    return {
      summary: {
        totalLoans,
        totalDisbursed: Number(totalDisbursed.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        totalCollateralValue: Number(totalCollateralValue.toFixed(2)),
        averageLoanAmount: Number((totalDisbursed / totalLoans).toFixed(2)),
        portfolioHealth: this.assessPortfolioHealth(nplAnalysis.nplRatio, ltvAnalysis.portfolioLTV)
      },
      ltvAnalysis,
      nplAnalysis,
      averageLoanSize,
      maturityDistribution,
      lossReserveAnalysis,
      riskAnalysis,
      collateralAnalysis,
      demographicAnalysis,
      officerPerformance,
      sectorDistribution
    };
  }

  // KEY METRIC 1: Loan-to-Value (LTV) Ratio
  // Formula: LTV = (Loan Amount ÷ Collateral Value) × 100
  private calculateLTVRatio(loans: Loan[], totalOutstanding: number, totalCollateralValue: number) {
    const portfolioLTV = totalCollateralValue > 0
      ? Number(((totalOutstanding / totalCollateralValue) * 100).toFixed(2))
      : 0;

    const loanLTVs = loans.map(loan => {
      const collateralValue = loan.totalCollateralValue;
      const loanAmount = Number(loan.disbursedAmount || 0);
      const ltv = collateralValue > 0 ? (loanAmount / collateralValue) * 100 : 0;

      return {
        loanId: loan.loanId,
        borrowerName: loan.borrower?.fullName || 'Unknown',
        loanAmount,
        collateralValue,
        ltv: Number(ltv.toFixed(2)),
        riskLevel: ltv > 90 ? 'High' : ltv > 80 ? 'Medium' : 'Low'
      };
    });

    const highRiskLoans = loanLTVs.filter(l => l.ltv > 80).length;
    const mediumRiskLoans = loanLTVs.filter(l => l.ltv > 70 && l.ltv <= 80).length;
    const lowRiskLoans = loanLTVs.filter(l => l.ltv <= 70).length;

    return {
      portfolioLTV,
      interpretation: portfolioLTV > 80 
        ? 'High risk - insufficient collateral coverage'
        : portfolioLTV > 70 
        ? 'Moderate risk - acceptable collateral coverage'
        : 'Low risk - strong collateral coverage',
      loanBreakdown: loanLTVs,
      riskDistribution: {
        highRisk: highRiskLoans,
        mediumRisk: mediumRiskLoans,
        lowRisk: lowRiskLoans
      }
    };
  }

  // KEY METRIC 2: Non-Performing Loans (NPL) Ratio
  // Formula: NPL Ratio = (Non-Performing Loans ÷ Total Loan Portfolio) × 100
  // ✅ FIXED: Use Outstanding Principal for accurate calculation
  private calculateNPLRatio(loans: Loan[], totalPortfolio: number) {
    const nonPerformingLoans = loans.filter(loan => 
      [LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL, LoanStatus.LOSS].includes(loan.status)
    );

    // ✅ FIXED: Calculate NPL amount from outstanding principal (current exposure)
    const nplAmount = nonPerformingLoans.reduce((sum, loan) => 
      sum + Number(loan.outstandingPrincipal || 0), 0
    );

    const nplRatio = totalPortfolio > 0 
      ? Number(((nplAmount / totalPortfolio) * 100).toFixed(2))
      : 0;

    const nplByStatus = {
      substandard: nonPerformingLoans.filter(l => l.status === LoanStatus.SUBSTANDARD).length,
      doubtful: nonPerformingLoans.filter(l => l.status === LoanStatus.DOUBTFUL).length,
      loss: nonPerformingLoans.filter(l => l.status === LoanStatus.LOSS).length
    };

    return {
      nplRatio,
      nplAmount: Number(nplAmount.toFixed(2)),
      nplCount: nonPerformingLoans.length,
      nplByStatus,
      interpretation: nplRatio < 5 
        ? 'Healthy portfolio - NPL below 5%'
        : nplRatio < 10 
        ? 'Acceptable portfolio - NPL between 5-10%'
        : 'Unhealthy portfolio - NPL above 10%, immediate action required',
      nonPerformingLoans: nonPerformingLoans.map(loan => ({
        loanId: loan.loanId,
        borrowerName: loan.borrower?.fullName || 'Unknown',
        outstandingAmount: Number(loan.outstandingPrincipal || 0),
        daysOverdue: loan.daysInArrears,
        status: loan.status
      }))
    };
  }

  // KEY METRIC 3: Average Loan Size
  // Formula: Average Loan Size = Total Loan Portfolio ÷ Number of Loans
  private calculateAverageLoanSize(totalPortfolio: number, numberOfLoans: number) {
    const averageSize = numberOfLoans > 0 
      ? Number((totalPortfolio / numberOfLoans).toFixed(2))
      : 0;

    return {
      averageLoanSize: averageSize,
      totalPortfolio: Number(totalPortfolio.toFixed(2)),
      numberOfLoans,
      interpretation: `Average loan size helps understand lending scale and diversification. Current average: ${averageSize.toLocaleString()}`
    };
  }

  // KEY METRIC 4: Loan Maturity Distribution
  private calculateMaturityDistribution(loans: Loan[]) {
    const today = new Date();
    const shortTerm: Loan[] = [];
    const mediumTerm: Loan[] = [];
    const longTerm: Loan[] = [];

    loans.forEach(loan => {
      if (!loan.agreedMaturityDate) return;

      const maturityDate = new Date(loan.agreedMaturityDate);
      const monthsRemaining = Math.ceil((maturityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30));

      if (monthsRemaining < 12) {
        shortTerm.push(loan);
      } else if (monthsRemaining <= 60) {
        mediumTerm.push(loan);
      } else {
        longTerm.push(loan);
      }
    });

    const totalPortfolio = loans.reduce((sum, loan) => sum + Number(loan.outstandingPrincipal || 0), 0);
    const shortTermAmount = shortTerm.reduce((sum, loan) => sum + Number(loan.outstandingPrincipal || 0), 0);
    const mediumTermAmount = mediumTerm.reduce((sum, loan) => sum + Number(loan.outstandingPrincipal || 0), 0);
    const longTermAmount = longTerm.reduce((sum, loan) => sum + Number(loan.outstandingPrincipal || 0), 0);

    return {
      shortTerm: {
        count: shortTerm.length,
        amount: Number(shortTermAmount.toFixed(2)),
        percentage: Number(((shortTermAmount / totalPortfolio) * 100).toFixed(2))
      },
      mediumTerm: {
        count: mediumTerm.length,
        amount: Number(mediumTermAmount.toFixed(2)),
        percentage: Number(((mediumTermAmount / totalPortfolio) * 100).toFixed(2))
      },
      longTerm: {
        count: longTerm.length,
        amount: Number(longTermAmount.toFixed(2)),
        percentage: Number(((longTermAmount / totalPortfolio) * 100).toFixed(2))
      },
      interpretation: 'Balanced maturity distribution helps manage liquidity risk and ensures stable cash flows'
    };
  }

  // KEY METRIC 5: Loan Loss Reserve Ratio
  // Formula: Loan Loss Reserve Ratio = (Loan Loss Reserve ÷ Total Loan Portfolio) × 100
  // ✅ FIXED: Use Outstanding Principal for accurate calculation
  private calculateLoanLossReserve(loans: Loan[], totalPortfolio: number) {
    let totalProvisionRequired = 0;

    loans.forEach(loan => {
      const netExposure = loan.calculateNetExposure();
      const provisioningRate = loan.getProvisioningRate();
      totalProvisionRequired += netExposure * provisioningRate;
    });

    const reserveRatio = totalPortfolio > 0 
      ? Number(((totalProvisionRequired / totalPortfolio) * 100).toFixed(2))
      : 0;

    return {
      totalProvisionRequired: Number(totalProvisionRequired.toFixed(2)),
      totalPortfolio: Number(totalPortfolio.toFixed(2)),
      reserveRatio,
      interpretation: `Reserve ratio of ${reserveRatio}% indicates ${
        reserveRatio < 2 ? 'low' : reserveRatio < 5 ? 'moderate' : 'high'
      } provision requirements for potential loan losses`,
      recommendedReserve: Number(totalProvisionRequired.toFixed(2))
    };
  }

  private calculateRiskAnalysis(loans: Loan[]) {
    const classifications = {
      performing: loans.filter(l => l.daysInArrears <= 30).length,
      watch: loans.filter(l => l.daysInArrears > 30 && l.daysInArrears <= 90).length,
      substandard: loans.filter(l => l.daysInArrears > 90 && l.daysInArrears <= 180).length,
      doubtful: loans.filter(l => l.daysInArrears > 180 && l.daysInArrears <= 365).length,
      loss: loans.filter(l => l.daysInArrears > 365).length
    };

    return {
      classifications,
      totalAtRisk: classifications.watch + classifications.substandard + classifications.doubtful + classifications.loss,
      riskPercentage: Number(((classifications.watch + classifications.substandard + classifications.doubtful + classifications.loss) / loans.length * 100).toFixed(2))
    };
  }

  private calculateCollateralAnalysis(loans: Loan[]) {
    const collateralTypes: Record<string, number> = {};
    let totalCollateralValue = 0;
    let adequatelySecured = 0;

    loans.forEach(loan => {
      loan.collaterals?.forEach(col => {
        collateralTypes[col.collateralType] = (collateralTypes[col.collateralType] || 0) + 1;
        totalCollateralValue += Number(col.collateralValue || 0);
      });

      if (loan.isAdequatelyCollateralized()) {
        adequatelySecured++;
      }
    });

    return {
      collateralTypes,
      totalCollateralValue: Number(totalCollateralValue.toFixed(2)),
      adequatelySecuredLoans: adequatelySecured,
      collateralizationRate: Number((adequatelySecured / loans.length * 100).toFixed(2))
    };
  }

  private calculateDemographicAnalysis(loans: Loan[]) {
    const byBusinessType: Record<string, number> = {};
    const bySector: Record<string, number> = {};
    const byBranch: Record<string, number> = {};

    loans.forEach(loan => {
      if (loan.businessType) {
        byBusinessType[loan.businessType] = (byBusinessType[loan.businessType] || 0) + 1;
      }
      if (loan.economicSector) {
        bySector[loan.economicSector] = (bySector[loan.economicSector] || 0) + 1;
      }
      if (loan.branchName) {
        byBranch[loan.branchName] = (byBranch[loan.branchName] || 0) + 1;
      }
    });

    return {
      byBusinessType,
      bySector,
      byBranch
    };
  }

  private calculateOfficerPerformance(loans: Loan[]) {
    const officerStats: Record<string, any> = {};

    loans.forEach(loan => {
      const officer = loan.loanOfficer || 'Not Assigned';
      
      if (!officerStats[officer]) {
        officerStats[officer] = {
          totalLoans: 0,
          totalDisbursed: 0,
          performingLoans: 0,
          nonPerformingLoans: 0,
          averageLoanSize: 0
        };
      }

      officerStats[officer].totalLoans++;
      officerStats[officer].totalDisbursed += Number(loan.disbursedAmount || 0);
      
      if (loan.daysInArrears <= 30) {
        officerStats[officer].performingLoans++;
      } else {
        officerStats[officer].nonPerformingLoans++;
      }
    });

    Object.keys(officerStats).forEach(officer => {
      officerStats[officer].averageLoanSize = Number(
        (officerStats[officer].totalDisbursed / officerStats[officer].totalLoans).toFixed(2)
      );
      officerStats[officer].performanceRate = Number(
        (officerStats[officer].performingLoans / officerStats[officer].totalLoans * 100).toFixed(2)
      );
    });

    return officerStats;
  }

  private calculateSectorDistribution(loans: Loan[]) {
    const sectorData: Record<string, any> = {};

    loans.forEach(loan => {
      const sector = loan.economicSector || 'Not Assigned';
      
      if (!sectorData[sector]) {
        sectorData[sector] = {
          count: 0,
          totalDisbursed: 0,
          totalOutstanding: 0,
          averageLoanSize: 0
        };
      }

      sectorData[sector].count++;
      sectorData[sector].totalDisbursed += Number(loan.disbursedAmount || 0);
      sectorData[sector].totalOutstanding += Number(loan.outstandingPrincipal || 0);
    });

    Object.keys(sectorData).forEach(sector => {
      sectorData[sector].averageLoanSize = Number(
        (sectorData[sector].totalDisbursed / sectorData[sector].count).toFixed(2)
      );
    });

    return sectorData;
  }

  private assessPortfolioHealth(nplRatio: number, ltvRatio: number): string {
    if (nplRatio < 5 && ltvRatio < 80) return 'Excellent';
    if (nplRatio < 10 && ltvRatio < 90) return 'Good';
    if (nplRatio < 15 && ltvRatio < 100) return 'Fair';
    return 'Poor - Immediate attention required';
  }

  private formatLoanForAnalysis(loan: Loan) {
    return {
      loanId: loan.loanId,
      borrowerName: loan.borrower?.fullName || 'Unknown',
      disbursedAmount: Number(loan.disbursedAmount || 0),
      outstandingPrincipal: Number(loan.outstandingPrincipal || 0),
      collateralValue: loan.totalCollateralValue,
      ltvRatio: loan.loanToValueRatio,
      daysInArrears: loan.daysInArrears,
      status: loan.status,
      classification: loan.getClassificationCategory(),
      economicSector: loan.economicSector,
      businessType: loan.businessType,
      loanOfficer: loan.loanOfficer,
      branchName: loan.branchName
    };
  }

  async getPortfolioTrends(organizationId: number, period: 'monthly' | 'quarterly' | 'yearly') {
    try {
      return {
        success: true,
        message: "Portfolio trends retrieved successfully",
        data: {
          period,
          trends: []
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to retrieve portfolio trends: ${error.message}`
      };
    }
  }
}