// @ts-nocheck

import { ExtendedGuarantorData, Guarantor } from "../entities/Guarantor";
import { In, IsNull, Not, Repository } from "typeorm";
import { Address, BorrowerDocument, BorrowerProfile, BorrowerProfileData, Gender, MaritalStatus, RelationshipType } from "../entities/BorrowerProfile";
import { Loan, LoanData, InterestMethod, RepaymentFrequency, LoanStatus, LoanApprovalData, IncomeFrequency, BorrowerType, InstitutionProfile, SpouseInfo, IncomeSourceInfo, InstitutionType, ShareholderBoardMemberInfo, LoanRelevantDocument, AdditionalDocumentRequest, DocumentRequestSummary } from "../entities/Loan";
import { LoanCollateral, CollateralType } from "../entities/LoanCollateral";
import { Organization } from "../entities/Organization";
import { PaymentStatus, RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";
import dbConnection from "../db";
import { UploadToCloud } from "../helpers/cloud";
import { v4 as uuidv4 } from 'uuid';
import { sendLoanStatusUpdateEmail } from "../templates/UpdateLoanBorrowerLoanApplicationStatusTemplate";
import { sendLoanApprovalEmail, sendLoanRejectionEmail } from "../templates/LoanApprovalEmailTemplate";
import { User, UserRole } from "../entities/User";
import { sendLoanReviewedEmail } from "../templates/LoanReviewedEmailTemplate";
import { LoanReview, ReviewDecision, ReviewStatus } from "../entities/LoanReview";
import { LoanWorkflow, WorkflowStep } from "../entities/LoanWorkflow";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";

export interface CollateralFiles {
  proofOfOwnership?: Express.Multer.File[];
  ownerIdentification?: Express.Multer.File[];
  legalDocument?: Express.Multer.File[];
  physicalEvidence?: Express.Multer.File[];
  valuationReport?: Express.Multer.File[];
  additionalCollateralDocs?: Express.Multer.File[];
  upiFile?: Express.Multer.File[];
}
interface LoanTermsCalculation {
  totalInterestAmount: number;
  totalAmountToBeRepaid: number;
  monthlyInstallmentAmount: number;
  totalNumberOfInstallments: number;
  outstandingPrincipal: number;
  agreedMaturityDate: Date;
  agreedFirstPaymentDate: Date;
  accruedInterestToDate: number;
  daysInArrears: number;
  status: LoanStatus;
}

export interface CollateralFiles {
  proofOfOwnership?: Express.Multer.File[];
  ownerIdentification?: Express.Multer.File[];
  legalDocument?: Express.Multer.File[];
  physicalEvidence?: Express.Multer.File[];
  valuationReport?: Express.Multer.File[];
  additionalCollateralDocs?: Express.Multer.File[];
}


export interface GuarantorFiles {
  guarantorIdentification?: Express.Multer.File[];
  guarantorCrbReport?: Express.Multer.File[];
  guarantorAdditionalDocs?: Express.Multer.File[];
}

export interface BorrowerFiles {
  marriageCertificate?: Express.Multer.File[] | File[];
  spouseCrbReport?: Express.Multer.File[] | File[];
  spouseIdentification?: Express.Multer.File[] | File[];
  witnessCrbReport?: Express.Multer.File[] | File[];
  witnessIdentification?: Express.Multer.File[] | File[];
  borrowerDocuments?: Express.Multer.File[] | File[];
  occupationSupportingDocuments?: Express.Multer.File[] | File[]; // ✅ must accept both
  loanRelevantDocuments?: Express.Multer.File[] | File[];
}

export interface InstitutionFiles {
  institutionLegalDocument?: Express.Multer.File[];
  cooperativeLegalDocument?: Express.Multer.File[];
  otherInstitutionLegalDocument?: Express.Multer.File[];
  institutionLicense?: Express.Multer.File[];
  institutionTradingLicense?: Express.Multer.File[];
  institutionRegistration?: Express.Multer.File[];
  shareholderIdentification?: Express.Multer.File[];
  boardMemberIdentification?: Express.Multer.File[];
  proofOfShares?: Express.Multer.File[];
  boardResolution?: Express.Multer.File[];
  shareholderCrbReport?: Express.Multer.File[];
  boardMemberCrbReport?: Express.Multer.File[];
  shareholderAdditionalDocs?: Express.Multer.File[];
  boardMemberAdditionalDocs?: Express.Multer.File[];
  institutionRelevantDocuments?: Express.Multer.File[];

}

export interface CollateralData {
  collateralType: CollateralType;
  description: string;
  upiNumber: string;
  collateralValue: number;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  valuationDate?: Date;
  valuedBy?: string;
  notes?: string;
  guarantorsData?: Array<{
    name: string;
    phone: string;
    address?: string;
    nationalId?: string;
    email?: string;
    guarantorType?: 'individual' | 'institution';
    guaranteedAmount?: number;
  }>;
}


export interface EnhancedLoanApplicationRequest {
  borrowerType: 'individual' | 'institution';
  borrowerData?: BorrowerProfileData;
  institutionData?: {
    institutionType: 'company' | 'cooperative' | 'other';
    otherInstitutionType?: string;
    institutionName: string;
    licenseNumber: string;
    registrationDate: string;
    tinNumber: string;
    contactPerson: string;
    contactPhone: string;
    contactEmail: string;
    address: Address;
  };
  spouseInformation?: {
    firstName: string;
    lastName: string;
    nationalId: string;
    phone: string;
    email?: string;
  };
  incomeSources: Array<{
    source: string;
    frequency: IncomeFrequency;
    amount: number;
    description?: string;
  }>;
  loanData: Omit<LoanData, 'borrowerId'> & {
    businessOfficer: string;
  };
  collateralData: CollateralData;
  additionalCollateralDocuments?: Array<{
    name: string;
    description?: string;
    files: File[];
  }>;
  organizationId: number;
  createdBy: number | null;
}

export interface EnhancedCollateralFiles extends CollateralFiles {
  institutionLegalDocument?: Express.Multer.File[];
  marriageCertificate?: Express.Multer.File[];
  spouseCrbReport?: Express.Multer.File[];
  witnessCrbReport?: Express.Multer.File[];
  borrowerCrbReport?: Express.Multer.File[];
  additionalCollateralDocuments?: Express.Multer.File[];
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

export interface LoanCalculationUpdate {
  outstandingPrincipal: number;
  accruedInterestToDate: number;
  daysInArrears: number;
  status: LoanStatus;
}

export interface DailyCalculationResult {
  totalLoansProcessed: number;
  totalInterestAccrued: number;
  loansWithUpdatedStatus: number;
  errors: string[];
}

export class LoanApplicationService {
  private repaymentScheduleRepository: Repository<RepaymentSchedule>;
  private readonly MAX_NUMERIC_VALUE = 9999999999999.99;
  private readonly MIN_LOAN_AMOUNT = 1000;
  // private readonly MAX_LOAN_AMOUNT = 100000000;
  private readonly MAX_TERM_MONTHS = 480;
  private guarantorRepository: Repository<Guarantor>;
  private clientBorrowerAccountRepository: Repository<ClientBorrowerAccount>;

  constructor(
    private borrowerRepository: Repository<BorrowerProfile>,
    private loanRepository: Repository<Loan>,
    private collateralRepository: Repository<LoanCollateral>,
    private organizationRepository: Repository<Organization>,
    private loanReviewRepository: Repository<LoanReview>,
    private userRepository: Repository<User>,
    private workflowRepository: Repository<LoanWorkflow>
  ) {
    this.repaymentScheduleRepository = dbConnection.getRepository(RepaymentSchedule);
    this.loanReviewRepository = dbConnection.getRepository(LoanReview); // ADD THIS
    this.userRepository = dbConnection.getRepository(User);
    this.workflowRepository = dbConnection.getRepository(LoanWorkflow);
    this.guarantorRepository = dbConnection.getRepository(Guarantor);
    this.clientBorrowerAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);

  }

async getDashboardAnalytics(organizationId: number): Promise<ServiceResponse> {
  try {
    console.log(`📊 Generating dashboard analytics for organization ${organizationId}`);

    // ===== A. LOAN STATUS DISTRIBUTION =====
    const statusDistribution = await this.loanRepository
      .createQueryBuilder('loan')
      .select('loan.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(loan.disbursedAmount), 0)', 'amount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .groupBy('loan.status')
      .getRawMany();

    const totalLoans = statusDistribution.reduce((sum, s) => sum + parseInt(s.count), 0);
    
    const loanStatusDistribution: any = {};
    statusDistribution.forEach(item => {
      const count = parseInt(item.count);
      const amount = parseFloat(item.amount);
      const percentage = totalLoans > 0 ? (count / totalLoans) * 100 : 0;

      loanStatusDistribution[item.status.toLowerCase()] = {
        count,
        amount: Number(amount.toFixed(2)),
        percentage: Number(percentage.toFixed(1))
      };
    });

    // ===== B. FINANCIAL METRICS =====
    const financialMetrics = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.disbursedAmount), 0)', 'totalDisbursed')
      .addSelect('COALESCE(SUM(loan.outstandingPrincipal), 0)', 'totalOutstandingPrincipal')
      .addSelect('COALESCE(SUM(loan.accruedInterestToDate), 0)', 'totalAccruedInterest')
      .addSelect('COALESCE(AVG(loan.disbursedAmount), 0)', 'averageLoanAmount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .getRawOne();

    const totalAmountToBeRepaid = parseFloat(financialMetrics.totalOutstandingPrincipal) + 
                                   parseFloat(financialMetrics.totalAccruedInterest);

    // ===== C. LOAN PERFORMANCE METRICS =====
    // ✅ FIXED: Proper counting with COALESCE to avoid null values
    const performanceMetrics = await this.loanRepository
      .createQueryBuilder('loan')
      .select(`
        COALESCE(COUNT(CASE WHEN loan.daysInArrears = 0 AND loan.status IN ('${LoanStatus.DISBURSED}', '${LoanStatus.PERFORMING}') THEN 1 END), 0) as "performingLoans",
        COALESCE(COUNT(CASE WHEN loan.daysInArrears BETWEEN 1 AND 30 AND loan.status = '${LoanStatus.WATCH}' THEN 1 END), 0) as "watchLoans",
        COALESCE(COUNT(CASE WHEN loan.daysInArrears BETWEEN 31 AND 90 AND loan.status = '${LoanStatus.SUBSTANDARD}' THEN 1 END), 0) as "substandardLoans",
        COALESCE(COUNT(CASE WHEN loan.daysInArrears BETWEEN 91 AND 180 AND loan.status = '${LoanStatus.DOUBTFUL}' THEN 1 END), 0) as "doubtfulLoans",
        COALESCE(COUNT(CASE WHEN loan.daysInArrears > 180 AND loan.status = '${LoanStatus.LOSS}' THEN 1 END), 0) as "lossLoans",
        COALESCE(AVG(CASE WHEN loan.status IN ('${LoanStatus.DISBURSED}', '${LoanStatus.PERFORMING}', '${LoanStatus.WATCH}', '${LoanStatus.SUBSTANDARD}', '${LoanStatus.DOUBTFUL}', '${LoanStatus.LOSS}') THEN loan.daysInArrears END), 0) as "averageDaysInArrears"
      `)
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status IN (:...statuses)', { 
        statuses: [
          LoanStatus.DISBURSED, 
          LoanStatus.PERFORMING, 
          LoanStatus.WATCH, 
          LoanStatus.SUBSTANDARD, 
          LoanStatus.DOUBTFUL, 
          LoanStatus.LOSS
        ] 
      })
      .getRawOne();

    // ✅ FIXED: Proper integer parsing with fallback to 0
    const totalActiveLoans = (parseInt(performanceMetrics.performingLoans) || 0) + 
                             (parseInt(performanceMetrics.watchLoans) || 0) +
                             (parseInt(performanceMetrics.substandardLoans) || 0) +
                             (parseInt(performanceMetrics.doubtfulLoans) || 0) +
                             (parseInt(performanceMetrics.lossLoans) || 0);

    const nonPerformingLoans = (parseInt(performanceMetrics.substandardLoans) || 0) +
                               (parseInt(performanceMetrics.doubtfulLoans) || 0) +
                               (parseInt(performanceMetrics.lossLoans) || 0);

    const nplRatio = totalActiveLoans > 0 ? (nonPerformingLoans / totalActiveLoans) * 100 : 0;

    const par30Loans = (parseInt(performanceMetrics.watchLoans) || 0) + nonPerformingLoans;
    const par90Loans = (parseInt(performanceMetrics.substandardLoans) || 0) + 
                       (parseInt(performanceMetrics.doubtfulLoans) || 0) +
                       (parseInt(performanceMetrics.lossLoans) || 0);
    const par180Loans = parseInt(performanceMetrics.lossLoans) || 0;

    const par30 = totalActiveLoans > 0 ? (par30Loans / totalActiveLoans) * 100 : 0;
    const par90 = totalActiveLoans > 0 ? (par90Loans / totalActiveLoans) * 100 : 0;
    const par180 = totalActiveLoans > 0 ? (par180Loans / totalActiveLoans) * 100 : 0;

    const collectionRate = 100 - nplRatio;

    // ===== D. BORROWER ANALYTICS =====
    const borrowerAnalytics = await this.loanRepository
      .createQueryBuilder('loan')
      .select('loan.borrowerType', 'borrowerType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(loan.disbursedAmount), 0)', 'amount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .groupBy('loan.borrowerType')
      .getRawMany();

    const byType: any = {};
    borrowerAnalytics.forEach(item => {
      const count = parseInt(item.count);
      const amount = parseFloat(item.amount);
      const percentage = totalLoans > 0 ? (count / totalLoans) * 100 : 0;

      byType[item.borrowerType] = {
        count,
        amount: Number(amount.toFixed(2)),
        percentage: Number(percentage.toFixed(1))
      };
    });

    // Relationship type distribution
    const relationshipAnalytics = await this.loanRepository
      .createQueryBuilder('loan')
      .leftJoin('loan.borrower', 'borrower')
      .select('borrower.relationshipWithNDFSP', 'relationshipType')
      .addSelect('COUNT(*)', 'count')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('borrower.relationshipWithNDFSP IS NOT NULL')
      .groupBy('borrower.relationshipWithNDFSP')
      .getRawMany();

    const byRelationship: any = {};
    relationshipAnalytics.forEach(item => {
      const count = parseInt(item.count);
      const percentage = totalLoans > 0 ? (count / totalLoans) * 100 : 0;

      byRelationship[item.relationshipType] = {
        count,
        percentage: Number(percentage.toFixed(1))
      };
    });

    // Count unique active borrowers
    const activeBorrowers = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COUNT(DISTINCT loan.borrowerId)', 'count')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.borrowerId IS NOT NULL')
      .getRawOne();

    // ===== E. TEMPORAL ANALYTICS ===== 
    // ✅ FIXED: Use PostgreSQL syntax instead of MySQL
    const currentYear = new Date().getFullYear();
    const monthlyTrends = await this.loanRepository
      .createQueryBuilder('loan')
      .select(`TO_CHAR(loan.disbursementDate, 'YYYY-MM')`, 'month')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(loan.disbursedAmount), 0)', 'amount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('EXTRACT(YEAR FROM loan.disbursementDate) = :year', { year: currentYear })
      .andWhere('loan.disbursementDate IS NOT NULL')
      .groupBy(`TO_CHAR(loan.disbursementDate, 'YYYY-MM')`)
      .orderBy(`TO_CHAR(loan.disbursementDate, 'YYYY-MM')`, 'ASC')
      .getRawMany();

    // Initialize all months
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const disbursementsByMonth = {
      count: new Array(12).fill(0),
      amount: new Array(12).fill(0)
    };

    monthlyTrends.forEach(item => {
      const monthIndex = parseInt(item.month.split('-')[1]) - 1;
      disbursementsByMonth.count[monthIndex] = parseInt(item.count);
      disbursementsByMonth.amount[monthIndex] = Number(parseFloat(item.amount).toFixed(2));
    });

    // Calculate growth rate (compare to previous year)
    // ✅ FIXED: Use EXTRACT instead of YEAR
    const previousYearTotal = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COUNT(*)', 'count')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('EXTRACT(YEAR FROM loan.createdAt) = :year', { year: currentYear - 1 })
      .getRawOne();

    const currentYearTotal = disbursementsByMonth.count.reduce((sum, c) => sum + c, 0);
    const prevYearCount = parseInt(previousYearTotal?.count || '0');
    const yearOverYearGrowth = prevYearCount > 0 
      ? ((currentYearTotal - prevYearCount) / prevYearCount) * 100 
      : 0;

    // ===== F. COLLATERAL & GUARANTOR METRICS =====
    const collateralMetrics = await this.loanRepository
      .createQueryBuilder('loan')
      .leftJoin('loan.collaterals', 'collateral')
      .leftJoin('loan.guarantors', 'guarantor')
      .select('COALESCE(SUM(collateral.collateralValue), 0)', 'totalCollateralValue')
      .addSelect('COUNT(DISTINCT guarantor.id)', 'totalGuarantors')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .getRawOne();

    const totalCollateralValue = parseFloat(collateralMetrics.totalCollateralValue);
    const totalOutstanding = parseFloat(financialMetrics.totalOutstandingPrincipal);
    const averageLTV = totalCollateralValue > 0 
      ? (totalOutstanding / totalCollateralValue) * 100 
      : 0;
    const collateralCoverageRatio = totalOutstanding > 0
      ? (totalCollateralValue / totalOutstanding) * 100
      : 0;
    const averageGuarantorsPerLoan = totalLoans > 0
      ? parseInt(collateralMetrics.totalGuarantors) / totalLoans
      : 0;

    // ===== G. SECTOR & BUSINESS TYPE DISTRIBUTION =====
    const sectorDistribution = await this.loanRepository
      .createQueryBuilder('loan')
      .select('loan.economicSector', 'sector')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(loan.disbursedAmount), 0)', 'amount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.economicSector IS NOT NULL')
      .groupBy('loan.economicSector')
      .getRawMany();

    const sectorData: any = {};
    sectorDistribution.forEach(item => {
      const count = parseInt(item.count);
      const amount = parseFloat(item.amount);
      const percentage = totalLoans > 0 ? (count / totalLoans) * 100 : 0;

      sectorData[item.sector] = {
        count,
        amount: Number(amount.toFixed(2)),
        percentage: Number(percentage.toFixed(1))
      };
    });

    const businessTypeDistribution = await this.loanRepository
      .createQueryBuilder('loan')
      .select('loan.businessType', 'businessType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(loan.disbursedAmount), 0)', 'amount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType IS NOT NULL')
      .groupBy('loan.businessType')
      .getRawMany();

    const businessTypeData: any = {};
    businessTypeDistribution.forEach(item => {
      const count = parseInt(item.count);
      const amount = parseFloat(item.amount);
      const percentage = totalLoans > 0 ? (count / totalLoans) * 100 : 0;

      businessTypeData[item.businessType] = {
        count,
        amount: Number(amount.toFixed(2)),
        percentage: Number(percentage.toFixed(1))
      };
    });

    // ===== H. RECENT ACTIVITY =====
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ✅ FIXED: Added COALESCE to prevent null values
    const recentActivity = await this.loanRepository
      .createQueryBuilder('loan')
      .select(`
        COALESCE(COUNT(CASE WHEN loan.status = '${LoanStatus.PENDING}' THEN 1 END), 0) as "newApplications",
        COALESCE(COUNT(CASE WHEN loan.status = '${LoanStatus.APPROVED}' THEN 1 END), 0) as "approved",
        COALESCE(COUNT(CASE WHEN loan.status = '${LoanStatus.DISBURSED}' THEN 1 END), 0) as "disbursed",
        COALESCE(COUNT(CASE WHEN loan.status = '${LoanStatus.REJECTED}' THEN 1 END), 0) as "rejected"
      `)
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.createdAt >= :date', { date: thirtyDaysAgo })
      .getRawOne();

    // ✅ FIXED: Added COALESCE to prevent null values
    const pendingActions = await this.loanRepository
      .createQueryBuilder('loan')
      .select(`
        COALESCE(COUNT(CASE WHEN loan.status = '${LoanStatus.PENDING}' THEN 1 END), 0) as "awaitingApproval",
        COALESCE(COUNT(CASE WHEN loan.status = '${LoanStatus.APPROVED}' THEN 1 END), 0) as "awaitingDisbursement",
        COALESCE(COUNT(CASE WHEN loan.hasDocumentRequest = true THEN 1 END), 0) as "documentRequestsPending",
        COALESCE(COUNT(CASE WHEN loan.daysInArrears > 0 THEN 1 END), 0) as "overdueLoans"
      `)
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .getRawOne();

    // ===== I. CHART DATA =====
    // Pie chart for loan status
    const statusColors: any = {
      performing: '#10b981',
      watch: '#f59e0b',
      substandard: '#ef4444',
      doubtful: '#7c3aed',
      loss: '#dc2626',
      pending: '#6b7280',
      approved: '#3b82f6',
      disbursed: '#8b5cf6'
    };

    const loanStatusPieChart = Object.entries(loanStatusDistribution).map(([name, data]: [string, any]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: data.count,
      color: statusColors[name] || '#6b7280'
    }));

    // Bar chart for monthly disbursements
    const monthlyDisbursementBarChart = monthLabels.map((month, index) => ({
      month,
      disbursed: disbursementsByMonth.amount[index],
      count: disbursementsByMonth.count[index]
    }));

    // Horizontal bar for sectors
    const sectorDistributionHorizontalBar = Object.entries(sectorData)
      .map(([sector, data]: [string, any]) => ({
        sector: sector.replace(/_/g, ' ').split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' '),
        amount: data.amount,
        count: data.count
      }))
      .sort((a, b) => b.amount - a.amount);

    // Line chart for loan performance trend
    const loanPerformanceTrendLine = monthLabels.map((month, index) => ({
      month,
      performing: disbursementsByMonth.count[index],
      overdue: 0 // This would require historical data tracking
    }));

    // ===== COMPILE RESPONSE =====
    const analyticsData = {
      overview: {
        totalLoans,
        totalDisbursed: Number(parseFloat(financialMetrics.totalDisbursed).toFixed(2)),
        totalOutstandingPrincipal: Number(parseFloat(financialMetrics.totalOutstandingPrincipal).toFixed(2)),
        totalAccruedInterest: Number(parseFloat(financialMetrics.totalAccruedInterest).toFixed(2)),
        averageLoanAmount: Number(parseFloat(financialMetrics.averageLoanAmount).toFixed(2)),
        activeBorrowers: parseInt(activeBorrowers.count)
      },
      loanStatusDistribution,
      performanceMetrics: {
        performingLoans: parseInt(performanceMetrics.performingLoans) || 0,
        watchLoans: parseInt(performanceMetrics.watchLoans) || 0,
        substandardLoans: parseInt(performanceMetrics.substandardLoans) || 0,
        doubtfulLoans: parseInt(performanceMetrics.doubtfulLoans) || 0,
        lossLoans: parseInt(performanceMetrics.lossLoans) || 0,
        totalActiveLoans,
        nonPerformingLoans,
        nplRatio: Number(nplRatio.toFixed(2)),
        portfolioAtRisk: {
          par30: Number(par30.toFixed(1)),
          par90: Number(par90.toFixed(1)),
          par180: Number(par180.toFixed(1))
        },
        collectionRate: Number(collectionRate.toFixed(2)),
        averageDaysInArrears: Number(parseFloat(performanceMetrics.averageDaysInArrears || '0').toFixed(1))
      },
      borrowerAnalytics: {
        byType,
        byRelationship
      },
      monthlyTrends: {
        labels: monthLabels,
        disbursements: disbursementsByMonth,
        growthRate: {
          yearOverYear: Number(yearOverYearGrowth.toFixed(1))
        }
      },
      sectorDistribution: sectorData,
      businessTypeDistribution: businessTypeData,
      collateralMetrics: {
        totalCollateralValue: Number(totalCollateralValue.toFixed(2)),
        averageLoanToValueRatio: Number(averageLTV.toFixed(1)),
        totalGuarantors: parseInt(collateralMetrics.totalGuarantors),
        averageGuarantorsPerLoan: Number(averageGuarantorsPerLoan.toFixed(1)),
        collateralCoverageRatio: Number(collateralCoverageRatio.toFixed(1))
      },
      recentActivity: {
        last30Days: {
          newApplications: parseInt(recentActivity.newApplications) || 0,
          approved: parseInt(recentActivity.approved) || 0,
          disbursed: parseInt(recentActivity.disbursed) || 0,
          rejected: parseInt(recentActivity.rejected) || 0
        },
        pendingActions: {
          awaitingApproval: parseInt(pendingActions.awaitingApproval) || 0,
          awaitingDisbursement: parseInt(pendingActions.awaitingDisbursement) || 0,
          documentRequestsPending: parseInt(pendingActions.documentRequestsPending) || 0,
          overdueLoans: parseInt(pendingActions.overdueLoans) || 0
        }
      },
      chartData: {
        loanStatusPieChart,
        monthlyDisbursementBarChart,
        sectorDistributionHorizontalBar,
        loanPerformanceTrendLine
      },
      timestamp: new Date().toISOString(),
      generatedFor: "Dashboard Overview"
    };

    console.log('✅ Dashboard analytics generated successfully');

    return {
      success: true,
      message: "Dashboard analytics retrieved successfully",
      data: analyticsData
    };

  } catch (error: any) {
    console.error('❌ Error generating dashboard analytics:', error);
    return {
      success: false,
      message: `Failed to generate dashboard analytics: ${error.message}`
    };
  }
}

  async getLoansForClientAccount(
    accountNumber: string,
    organizationId: number
  ): Promise<ServiceResponse<Loan[]>> {
    try {
      const clientAccount = await this.clientBorrowerAccountRepository.findOne({
        where: {
          accountNumber,
          organizationId,
          isActive: true
        },
        relations: ['loans', 'loans.borrower'] // ✅ Use the relationship
      });

      if (!clientAccount) {
        return {
          success: false,
          message: `Client account ${accountNumber} not found`
        };
      }

      // ✅ Access loans via relationship
      const loans = clientAccount.loans || [];

      console.log(`✅ Found ${loans.length} loans for account ${accountNumber}`);

      return {
        success: true,
        message: `Retrieved ${loans.length} loans`,
        data: loans
      };
    } catch (error: any) {
      console.error('Error fetching loans for account:', error);
      return {
        success: false,
        message: `Failed to fetch loans: ${error.message}`
      };
    }
  }

  async getClientAccountWithLoans(
    accountNumber: string,
    organizationId: number
  ): Promise<ServiceResponse<any>> {
    try {
      const clientAccount = await this.clientBorrowerAccountRepository.findOne({
        where: {
          accountNumber,
          organizationId,
          isActive: true
        },
        relations: ['loans', 'borrower'] // ✅ Load relationships
      });

      if (!clientAccount) {
        return {
          success: false,
          message: `Client account ${accountNumber} not found`
        };
      }

      // ✅ Calculate statistics from all loans
      const loans = clientAccount.loans || [];
      const totalDisbursed = loans.reduce((sum, loan) => sum + (loan.disbursedAmount || 0), 0);
      const activeLoans = loans.filter(l => l.status === LoanStatus.DISBURSED || l.status === LoanStatus.PERFORMING);
      const completedLoans = loans.filter(l => l.status === LoanStatus.CLOSED || l.status === LoanStatus.COMPLETED);

      return {
        success: true,
        message: 'Client account retrieved successfully',
        data: {
          account: clientAccount,
          loanStatistics: {
            totalLoans: loans.length,
            activeLoans: activeLoans.length,
            completedLoans: completedLoans.length,
            totalDisbursed,
            loanIds: loans.map(l => l.loanId)
          },
          loans // ✅ All loans from relationship
        }
      };
    } catch (error: any) {
      console.error('Error fetching client account:', error);
      return {
        success: false,
        message: `Failed to fetch client account: ${error.message}`
      };
    }
  }

async createCompleteLoanApplication(
    borrowerData: BorrowerProfileData,
    loanData: any,
    collateralData: CollateralData,
    organizationId: number,
    createdBy: number | null,
    collateralFiles: CollateralFiles,
    guarantorFiles: GuarantorFiles,
    borrowerFiles: BorrowerFiles,
    institutionFiles: InstitutionFiles,
    existingBorrowerId?: number | null,
    sourceBorrowerId?: number | null,
    clientAccountId?: number | null
  ): Promise<ServiceResponse<any>> {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  COMPLETE FIXED LOAN APPLICATION SERVICE                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const queryRunner = dbConnection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ===== STEP 1: VALIDATE ORGANIZATION =====
      console.log('🔍 STEP 1: VALIDATE ORGANIZATION');
      const organization = await queryRunner.manager.findOne(Organization, {
        where: { id: organizationId }
      });
      if (!organization) throw new Error(`Organization ${organizationId} not found`);

      const relationshipType = borrowerData.relationshipWithNDFSP || RelationshipType.NEW_BORROWER;
      console.log(`🔍 Relationship Type: ${relationshipType}`);
      console.log(`🔍 Source Borrower ID from request: ${sourceBorrowerId}`);
      console.log(`🔍 Existing Borrower ID parameter: ${existingBorrowerId}`);
      console.log(`🔍 Client Account ID from request: ${clientAccountId}`);

      // ===== STEP 2: CREATE OR USE EXISTING BORROWER =====
      console.log('🔍 STEP 2: CREATE OR USE EXISTING BORROWER PROFILE');

      let savedBorrower: BorrowerProfile | null = null;
      let isExistingBorrower = false;
      let existingClientAccount: ClientBorrowerAccount | null = null;

      // ✅ FIXED: For repeat borrowers, find client account by borrower identifier (national ID or TIN)
      // NOT by clientAccountId which might be a form field index
      if (relationshipType === RelationshipType.REPEAT_BORROWER) {
        console.log('🔍 LOADING EXISTING CLIENT ACCOUNT FOR REPEAT BORROWER');

        const borrowerType = loanData.borrowerType || BorrowerType.INDIVIDUAL;
        const identifier = borrowerType === BorrowerType.INDIVIDUAL
          ? borrowerData.nationalId
          : loanData.institutionProfile?.tinNumber;

        console.log(`   Searching by identifier: ${identifier} (${borrowerType})`);

        existingClientAccount = await queryRunner.manager.findOne(ClientBorrowerAccount, {
          where: {
            organizationId,
            ...(borrowerType === BorrowerType.INDIVIDUAL
              ? { nationalId: identifier }
              : { tinNumber: identifier }
            ),
            isActive: true
          },
          relations: ['loans']  // ✅ Load existing loans
        });

        if (existingClientAccount) {
          console.log(`✅ Found client account: ${existingClientAccount.accountNumber}`);
          console.log(`   Account ID: ${existingClientAccount.id}`);
          console.log(`   Borrower ID: ${existingClientAccount.borrowerId}`);
          console.log(`   Current loans count: ${existingClientAccount.loans?.length || 0}`);
          
          // ✅ Use the borrower ID from the client account
          if (existingClientAccount.borrowerId) {
            existingBorrowerId = existingClientAccount.borrowerId;
            console.log(`   Will use borrower ID from client account: ${existingBorrowerId}`);
          }
        } else {
          console.log('❌ ERROR: Repeat borrower selected but no client account found');
          throw new Error(`Cannot process repeat borrower without existing client account. ${borrowerType === BorrowerType.INDIVIDUAL ? 'National ID' : 'TIN'}: ${identifier}`);
        }
      }

      // ===== PRIORITY 1: Use sourceBorrowerId or existingBorrowerId if provided =====
      let foundBorrowerId = sourceBorrowerId || existingBorrowerId;

      if (foundBorrowerId) {
        console.log(`🎯 Priority 1: Checking by provided borrower ID: ${foundBorrowerId}`);

        const existingBorrower = await queryRunner.manager.findOne(BorrowerProfile, {
          where: {
            id: foundBorrowerId,
            organizationId,
            isActive: true
          }
        });

        if (existingBorrower) {
          savedBorrower = existingBorrower;
          isExistingBorrower = true;
          console.log(`✅ Found existing borrower by provided ID: ${savedBorrower.fullName} (ID: ${savedBorrower.id})`);
        } else {
          console.log(`⚠️ Provided borrower ID ${foundBorrowerId} not found`);
        }
      }

      // ===== PRIORITY 2: Check by national ID if no ID found or not found =====
      if (!isExistingBorrower && borrowerData.nationalId) {
        console.log(`🎯 Priority 2: Checking by national ID: ${borrowerData.nationalId}`);

        const borrowerByNationalId = await queryRunner.manager.findOne(BorrowerProfile, {
          where: {
            nationalId: borrowerData.nationalId,
            organizationId,
            isActive: true
          }
        });

        if (borrowerByNationalId) {
          savedBorrower = borrowerByNationalId;
          isExistingBorrower = true;
          foundBorrowerId = borrowerByNationalId.id;
          console.log(`✅ Found existing borrower by national ID: ${savedBorrower.fullName} (ID: ${savedBorrower.id})`);
        } else {
          console.log(`⚠️ No existing borrower found by national ID`);
        }
      }

      // ===== PRIORITY 3: Create new borrower if none found =====
      if (!isExistingBorrower) {
        console.log('⚠️ No existing borrower found, creating new borrower profile');
        savedBorrower = await this.createNewBorrower(borrowerData, organizationId, createdBy, queryRunner);
      } else {
        // ✅ UPDATE: Update existing borrower with new data
        console.log(`🔄 Updating existing borrower with new application data...`);

        // Always update relationship type from new application
        if (relationshipType && savedBorrower) {
          savedBorrower.relationshipWithNDFSP = relationshipType;
          console.log(`   Updated relationship type to: ${relationshipType}`);
        }

        // Update other borrower fields
        if (savedBorrower) {
          if (borrowerData.primaryPhone) savedBorrower.primaryPhone = borrowerData.primaryPhone;
          if (borrowerData.alternativePhone) savedBorrower.alternativePhone = borrowerData.alternativePhone;
          if (borrowerData.email) savedBorrower.email = borrowerData.email;
          if (borrowerData.occupation) savedBorrower.occupation = borrowerData.occupation;
          if (borrowerData.monthlyIncome) savedBorrower.monthlyIncome = borrowerData.monthlyIncome;
          if (borrowerData.incomeSource) savedBorrower.incomeSource = borrowerData.incomeSource;
          if (borrowerData.address) savedBorrower.address = borrowerData.address;
          if (borrowerData.nationalIdDistrict) savedBorrower.nationalIdDistrict = borrowerData.nationalIdDistrict;
          if (borrowerData.nationalIdSector) savedBorrower.nationalIdSector = borrowerData.nationalIdSector;
          if (borrowerData.parentsInformation) savedBorrower.parentsInformation = borrowerData.parentsInformation;

          await queryRunner.manager.save(BorrowerProfile, savedBorrower);
          console.log(`✅ Updated existing borrower profile`);
        }
      }

      const borrowerType = loanData.borrowerType || BorrowerType.INDIVIDUAL;

      if (borrowerFiles.occupationSupportingDocuments?.length > 0 && createdBy) {
        let descriptions: string[] = [];
        try {
          descriptions = typeof loanData.occupationSupportingDocDescriptions === 'string'
            ? JSON.parse(loanData.occupationSupportingDocDescriptions)
            : (loanData.occupationSupportingDocDescriptions || []);
        } catch (e) {
          console.error('Failed to parse occupation doc descriptions:', e);
        }

        console.log(`   Processing ${borrowerFiles.occupationSupportingDocuments.length} occupation documents`);

        if (!savedBorrower.occupationSupportingDocuments) {
          savedBorrower.occupationSupportingDocuments = [];
        }

        // ✅ CRITICAL FIX: Check for existing documents to prevent duplication
        const existingDocHashes = new Set(
          savedBorrower.occupationSupportingDocuments.map(doc =>
            `${doc.description}-${doc.fileName}`
          )
        );

        for (let i = 0; i < borrowerFiles.occupationSupportingDocuments.length; i++) {
          const file = borrowerFiles.occupationSupportingDocuments[i];
          const description = descriptions[i] || `Occupation Document ${i + 1}`;
          const hash = `${description}-${file.originalname}`;

          // ✅ Skip if document already exists
          if (existingDocHashes.has(hash)) {
            console.log(`⏭️ Skipping duplicate document: ${description}`);
            continue;
          }

          const uploadedFile = await UploadToCloud(file);
          savedBorrower.addOccupationSupportingDocument(
            'occupation_supporting',
            uploadedFile.secure_url,
            description,
            file.originalname,
            createdBy
          );
          console.log(`✅ Added new document: ${description}`);
        }

        await queryRunner.manager.save(BorrowerProfile, savedBorrower);
        console.log(`✅ Occupation documents saved (duplicates skipped)`);
      }

if (borrowerFiles.borrowerDocuments?.length > 0 && createdBy) {
  console.log(`🔍 PROCESSING BORROWER DOCUMENTS - START`);
  console.log(`   Received ${borrowerFiles.borrowerDocuments.length} borrower document files`);
  
  // Log each file received
  borrowerFiles.borrowerDocuments.forEach((file, idx) => {
    console.log(`   File ${idx}: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
  });

  let descriptions: string[] = [];
  try {
    descriptions = typeof loanData.borrowerDocumentDescriptions === 'string'
      ? JSON.parse(loanData.borrowerDocumentDescriptions)
      : (loanData.borrowerDocumentDescriptions || []);
    console.log(`   Parsed ${descriptions.length} document descriptions:`, descriptions);
  } catch (e) {
    console.error('❌ Failed to parse borrower doc descriptions:', e);
  }

  // Ensure we have descriptions for all files
  const documentsWithDescriptions = borrowerFiles.borrowerDocuments.map((file, index) => ({
    description: descriptions[index] || `Borrower Document ${index + 1}`,
    file
  }));

  console.log(`   Prepared ${documentsWithDescriptions.length} documents with descriptions`);

  await this.saveBorrowerDocuments(savedBorrower.id, documentsWithDescriptions, createdBy, queryRunner);
  
  // ✅ VERIFY immediately after saving
  const verification = await this.verifyBorrowerDocuments(savedBorrower.id);
  console.log(`   Verification result:`, verification);
  
  console.log(`✅ BORROWER DOCUMENTS PROCESSING COMPLETE`);
}

      // ===== STEP 2.4: INSTITUTION RELEVANT DOCUMENTS =====
      console.log('🔍 STEP 2.4: PROCESS INSTITUTION RELEVANT DOCUMENTS');
      let institutionRelevantDocs: any[] = [];

      if (borrowerType === BorrowerType.INSTITUTION &&
        institutionFiles.institutionRelevantDocuments?.length > 0 &&
        createdBy) {

        let descriptions: string[] = [];
        try {
          descriptions = typeof loanData.institutionRelevantDocumentDescriptions === 'string'
            ? JSON.parse(loanData.institutionRelevantDocumentDescriptions)
            : (loanData.institutionRelevantDocumentDescriptions || []);
        } catch (e) {
          console.error('Failed to parse institution doc descriptions:', e);
        }

        for (let i = 0; i < institutionFiles.institutionRelevantDocuments.length; i++) {
          const file = institutionFiles.institutionRelevantDocuments[i];
          const description = descriptions[i] || `Institution Document ${i + 1}`;
          const uploadedFile = await UploadToCloud(file);

          institutionRelevantDocs.push({
            description,
            fileUrl: uploadedFile.secure_url,
            uploadedAt: new Date().toISOString(),
            uploadedBy: createdBy
          });
        }
        console.log(`✅ ${institutionRelevantDocs.length} institution documents processed`);
      }

      // ===== STEP 3: CREATE LOAN =====
      console.log('🔍 STEP 3: CREATE LOAN APPLICATION');

      // ✅ CRITICAL FIX: Ensure savedBorrower exists before creating loan
      if (!savedBorrower) {
        throw new Error("Failed to create or retrieve borrower. Cannot proceed with loan creation.");
      }

      const loanId = `LN${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // ✅ ENHANCED: Set hasClientAccount flag based on relationship type
      const hasClientAccount = relationshipType === RelationshipType.REPEAT_BORROWER;

      const loan = queryRunner.manager.create(Loan, {
        loanId,
        borrowerId: savedBorrower.id,
        borrowerType: borrowerType,
        purposeOfLoan: loanData.purposeOfLoan,
        branchName: loanData.branchName,
        businessOfficer: loanData.businessOfficer,
        loanOfficer: loanData.businessOfficer,
        disbursedAmount: loanData.disbursedAmount,
        businessType: loanData.businessType || null,
        businessStructure: loanData.businessStructure || null,
        economicSector: loanData.economicSector || null,
        notes: loanData.notes || null,
        maritalStatus: loanData.maritalStatus || null,
        spouseInfo: loanData.spouseInfo || null,
        institutionProfile: loanData.institutionProfile || null,
        incomeSources: loanData.incomeSources || null,
        incomeSource: loanData.incomeSource || null,
        otherIncomeSource: loanData.otherIncomeSource || null,
        incomeFrequency: loanData.incomeFrequency || null,
        incomeAmount: loanData.incomeAmount || null,
        shareholderBoardMembers: loanData.shareholderBoardMembers || null,
        paymentPeriod: loanData.paymentPeriod || null,
        customPaymentPeriod: loanData.customPaymentPeriod || null,
        loanRelevantDocuments: [],
        paymentFrequency: loanData.paymentFrequency || null,
        preferredPaymentFrequency: loanData.preferredPaymentFrequency || null,
        institutionRelevantDocuments: institutionRelevantDocs.length > 0 ? institutionRelevantDocs : null,
        outstandingPrincipal: loanData.disbursedAmount,
        accruedInterestToDate: 0,
        daysInArrears: 0,
        status: LoanStatus.PENDING,
        organizationId,
        createdBy,
        isActive: true,
        hasClientAccount: hasClientAccount,
      });

      const savedLoan = await queryRunner.manager.save(Loan, loan);
      console.log(`✅ Loan created: ${savedLoan.loanId}`);
      console.log(`✅ hasClientAccount flag: ${hasClientAccount}`);
      console.log(`✅ Relationship type for loan: ${relationshipType}`);

      if (hasClientAccount && existingClientAccount) {
        console.log('🔄 LINKING LOAN TO CLIENT ACCOUNT');

        // Step 1: Set foreign key relationship
        savedLoan.clientAccountId = existingClientAccount.id;
        savedLoan.clientAccount = existingClientAccount;
        
        // Step 2: Save loan with clientAccountId
        await queryRunner.manager.save(Loan, savedLoan);
        console.log(`✅ Saved loan with clientAccountId: ${existingClientAccount.id}`);

        // Step 3: Reload client account with current loans
        const reloadedAccount = await queryRunner.manager.findOne(
          ClientBorrowerAccount,
          {
            where: { id: existingClientAccount.id },
            relations: ['loans']
          }
        );

        if (!reloadedAccount) {
          throw new Error('Failed to reload client account');
        }

        // Step 4: Ensure loans array is initialized
        if (!reloadedAccount.loans) {
          reloadedAccount.loans = [];
        }

        // Step 5: Add current loan if not already present
        const loanExists = reloadedAccount.loans.some(l => l.id === savedLoan.id);
        if (!loanExists) {
          reloadedAccount.loans.push(savedLoan);
        }

        const totalLoans = reloadedAccount.loans.length;
        const allLoanIds = reloadedAccount.loans.map(l => l.loanId);

        console.log(`📊 Total loans for account: ${totalLoans}`);
        console.log(`📋 Loan IDs: ${allLoanIds.join(', ')}`);

        // Step 6: Update profile information
        if (borrowerType === BorrowerType.INDIVIDUAL) {
          // Update individual borrower account
          const updatedNames = `${borrowerData.firstName} ${borrowerData.middleName || ''} ${borrowerData.lastName}`.trim();
          reloadedAccount.borrowerNames = updatedNames;
          reloadedAccount.nationalId = borrowerData.nationalId;

          // ✅ Update profile information with ALL changes + loan history
          reloadedAccount.profileInformation = {
            ...(reloadedAccount.profileInformation || {}),
            phone: borrowerData.primaryPhone,
            alternativePhone: borrowerData.alternativePhone,
            email: borrowerData.email,
            gender: borrowerData.gender,
            dateOfBirth: borrowerData.dateOfBirth,
            maritalStatus: borrowerData.maritalStatus,
            placeOfBirth: borrowerData.placeOfBirth,
            address: borrowerData.address,
            occupation: borrowerData.occupation,
            monthlyIncome: borrowerData.monthlyIncome,
            incomeSource: borrowerData.incomeSource,
            nationalIdDistrict: borrowerData.nationalIdDistrict,
            nationalIdSector: borrowerData.nationalIdSector,
            parentsInformation: borrowerData.parentsInformation,
            incomeSources: loanData.incomeSources,
            spouseInfo: loanData.spouseInfo,
            businessType: loanData.businessType,
            businessStructure: loanData.businessStructure,
            economicSector: loanData.economicSector,
            updatedAt: new Date().toISOString(),
            lastLoanId: savedLoan.loanId,
            lastLoanDate: new Date().toISOString(),
            totalLoans: totalLoans,
            allLoanIds: allLoanIds
          };

          console.log(`✅ Updated individual client account fields`);
          console.log(`   Total loans tracked: ${totalLoans}`);
        } else {
          // Update institution borrower account
          reloadedAccount.institutionName = loanData.institutionProfile?.institutionName;
          reloadedAccount.tinNumber = loanData.institutionProfile?.tinNumber;
          reloadedAccount.businessNumber = loanData.institutionProfile?.licenseNumber;

          reloadedAccount.institutionInformation = {
            ...(reloadedAccount.institutionInformation || {}),
            institutionType: loanData.institutionProfile?.institutionType,
            otherInstitutionType: loanData.institutionProfile?.otherInstitutionType,
            licenseNumber: loanData.institutionProfile?.licenseNumber,
            registrationDate: loanData.institutionProfile?.registrationDate,
            contactPerson: loanData.institutionProfile?.contactPerson,
            contactPhone: loanData.institutionProfile?.contactPhone,
            contactEmail: loanData.institutionProfile?.contactEmail,
            address: loanData.institutionProfile?.address,
            shareholderBoardMembers: loanData.shareholderBoardMembers,
            businessType: loanData.businessType,
            businessStructure: loanData.businessStructure,
            economicSector: loanData.economicSector,
            updatedAt: new Date().toISOString(),
            lastLoanId: savedLoan.loanId,
            lastLoanDate: new Date().toISOString(),
            totalLoans: totalLoans,
            allLoanIds: allLoanIds
          };

          if (loanData.institutionProfile?.contactPerson) {
            reloadedAccount.profileRepresentative = {
              name: loanData.institutionProfile.contactPerson,
              position: 'Contact Person',
              phone: loanData.institutionProfile.contactPhone || '',
              email: loanData.institutionProfile.contactEmail || ''
            };
          }

          console.log(`✅ Updated institution client account fields`);
          console.log(`   Total loans tracked: ${totalLoans}`);
        }

        // Step 7: Save updated client account
        await queryRunner.manager.save(ClientBorrowerAccount, reloadedAccount);
        console.log('✅ CLIENT BORROWER ACCOUNT SUCCESSFULLY UPDATED WITH LOAN RELATIONSHIP');
        console.log(`   Account Number: ${reloadedAccount.accountNumber}`);
        console.log(`   New Loan Added: ${savedLoan.loanId}`);
        console.log(`   All Loans: ${allLoanIds.join(', ')}`);
      } else if (hasClientAccount && !existingClientAccount) {
        // ✅ CONDITION 4: Error Handling - Proper validation for repeat borrowers without client accounts
        console.log('❌ CRITICAL ERROR: Repeat borrower relationship type detected but no client account found');
        throw new Error(`Cannot process repeat borrower without existing client account. National ID: ${borrowerData.nationalId}`);
      } else if (relationshipType === RelationshipType.REPEAT_BORROWER && !existingClientAccount) {
        console.log('⚠️ WARNING: Relationship type is REPEAT_BORROWER but no client account was found/updated');
      }

      // ===== STEP 3.2: LOAN RELEVANT DOCUMENTS =====
      console.log('🔍 STEP 3.2: PROCESS LOAN RELEVANT DOCUMENTS');
      if (borrowerFiles.loanRelevantDocuments?.length > 0 && createdBy) {
        let descriptions: string[] = [];
        try {
          descriptions = typeof loanData.loanRelevantDocumentDescriptions === 'string'
            ? JSON.parse(loanData.loanRelevantDocumentDescriptions)
            : (loanData.loanRelevantDocumentDescriptions || []);
        } catch (e) {
          console.error('Failed to parse loan doc descriptions:', e);
        }

        const documentsWithDescriptions = borrowerFiles.loanRelevantDocuments.map((file, index) => ({
          description: descriptions[index] || `Loan Document: ${file.originalname}`,
          file
        }));

        await this.saveLoanRelevantDocuments(savedLoan.id, documentsWithDescriptions, createdBy, queryRunner);
        console.log(`✅ ${documentsWithDescriptions.length} loan relevant documents uploaded`);
      }

      // ===== STEP 4: CREATE COLLATERAL =====
      console.log('🔍 STEP 4: CREATE COLLATERAL');
      const collateralId = `COL${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const collateral = queryRunner.manager.create(LoanCollateral, {
        collateralId,
        loanId: savedLoan.id,
        collateralType: collateralData.collateralType,
        upiNumber: collateralData.upiNumber || null,
        description: collateralData.description,
        collateralValue: collateralData.collateralValue,
        guarantorName: collateralData.guarantorName || null,
        guarantorPhone: collateralData.guarantorPhone || null,
        guarantorAddress: collateralData.guarantorAddress || null,
        valuationDate: collateralData.valuationDate || null,
        valuedBy: collateralData.valuedBy || null,
        notes: collateralData.notes || null,
        additionalDocumentsUrls: [],
        isActive: true,
        createdBy
      });

      const savedCollateral = await queryRunner.manager.save(LoanCollateral, collateral);
      console.log(`✅ Collateral created: ${savedCollateral.collateralId}`);

      // ===== STEP 4.1: COLLATERAL DOCUMENTS =====
      console.log('🔍 STEP 4.1: UPLOAD COLLATERAL DOCUMENTS');
      await this.uploadCollateralDocuments(
        savedCollateral,
        collateralFiles,
        createdBy,
        loanData.collateralAdditionalDocDescriptions,
        queryRunner
      );

// ===== STEP 5: CREATE GUARANTORS =====
console.log('🔍 STEP 5: CREATE GUARANTORS');
let spouseGuarantorCreated = false;
let guarantorsCount = 0;

// Auto-create spouse as guarantor
if (borrowerType === BorrowerType.INDIVIDUAL &&
  loanData.maritalStatus === MaritalStatus.MARRIED &&
  loanData.spouseInfo) {

  const spouseGuarantor = queryRunner.manager.create(Guarantor, {
    name: `${loanData.spouseInfo.firstName} ${loanData.spouseInfo.lastName}`,
    phone: loanData.spouseInfo.phone,
    address: 'Spouse of borrower',
    nationalId: loanData.spouseInfo.nationalId,
    guaranteedAmount: loanData.disbursedAmount,
    collateralType: savedCollateral.collateralType,
    upiNumber: savedCollateral.upiNumber,
    collateralDescription: savedCollateral.description,
    loanId: savedLoan.id,
    collateralId: savedCollateral.id,
    borrowerId: savedBorrower.id,
    organizationId,
    createdBy,
    isActive: true,
    guarantorType: 'individual',
    guarantorDocuments: [] // ✅ Initialize empty array
  });

  const savedSpouseGuarantor = await queryRunner.manager.save(Guarantor, spouseGuarantor);
  spouseGuarantorCreated = true;
  guarantorsCount++;
  console.log('✅ Spouse auto-created as guarantor');
  
  // ✅ FIX: Process guarantor documents for spouse if any
  if (guarantorFiles.guarantorAdditionalDocs?.length > 0) {
    let descriptions: string[] = [];
    try {
      descriptions = typeof loanData.guarantorDocumentDescriptions === 'string'
        ? JSON.parse(loanData.guarantorDocumentDescriptions)
        : (loanData.guarantorDocumentDescriptions || []);
    } catch (e) {
      console.error('Failed to parse guarantor doc descriptions:', e);
    }

    console.log(`📄 Processing ${guarantorFiles.guarantorAdditionalDocs.length} guarantor documents for spouse`);
    
    const documentsWithDescriptions = guarantorFiles.guarantorAdditionalDocs.map((file, index) => ({
      description: descriptions[index] || `Guarantor Document ${index + 1}`,
      file
    }));

    await this.saveGuarantorDocuments(savedSpouseGuarantor.id, documentsWithDescriptions, queryRunner);
    console.log(`✅ ${documentsWithDescriptions.length} guarantor documents saved for spouse`);
  }
}

// Create additional guarantors
if (collateralData.guarantorsData?.length > 0) {
  console.log(`🔍 Processing ${collateralData.guarantorsData.length} additional guarantors`);
  
  // ✅ FIX: Parse guarantor document descriptions
  let guarantorDocDescriptions: string[] = [];
  try {
    guarantorDocDescriptions = typeof loanData.guarantorDocumentDescriptions === 'string'
      ? JSON.parse(loanData.guarantorDocumentDescriptions)
      : (loanData.guarantorDocumentDescriptions || []);
  } catch (e) {
    console.error('Failed to parse guarantor doc descriptions:', e);
    guarantorDocDescriptions = [];
  }

  console.log(`📄 Guarantor document descriptions available: ${guarantorDocDescriptions.length}`);

  // ✅ FIX: Distribute documents among guarantors
  const totalGuarantors = collateralData.guarantorsData.length;
  const totalDocs = guarantorFiles.guarantorAdditionalDocs?.length || 0;
  
  // Calculate documents per guarantor (distribute evenly)
  const docsPerGuarantor = totalDocs > 0 ? Math.floor(totalDocs / totalGuarantors) : 0;
  const remainingDocs = totalDocs > 0 ? totalDocs % totalGuarantors : 0;

  for (let i = 0; i < collateralData.guarantorsData.length; i++) {
    const guarantorData = collateralData.guarantorsData[i];
    
    const guarantor = queryRunner.manager.create(Guarantor, {
      name: guarantorData.name,
      phone: guarantorData.phone,
      address: guarantorData.address || '',
      nationalId: guarantorData.nationalId || null,
      email: guarantorData.email || null,
      guaranteedAmount: guarantorData.guaranteedAmount || loanData.disbursedAmount * 0.1,
      collateralType: savedCollateral.collateralType,
      upiNumber: savedCollateral.upiNumber,
      collateralDescription: savedCollateral.description,
      loanId: savedLoan.id,
      collateralId: savedCollateral.id,
      borrowerId: savedBorrower.id,
      organizationId,
      createdBy,
      isActive: true,
      guarantorType: guarantorData.guarantorType || 'individual',
      guarantorDocuments: [] // ✅ Initialize empty array
    });

    const savedGuarantor = await queryRunner.manager.save(Guarantor, guarantor);
    guarantorsCount++;

    // ✅ FIX: Process documents for this specific guarantor
    if (totalDocs > 0) {
      // Calculate which documents belong to this guarantor
      const startIdx = i * docsPerGuarantor + Math.min(i, remainingDocs);
      const docCount = docsPerGuarantor + (i < remainingDocs ? 1 : 0);
      
      if (docCount > 0) {
        const guarantorSpecificDocs = [];
        
        for (let j = 0; j < docCount; j++) {
          const docIdx = startIdx + j;
          if (docIdx < totalDocs && guarantorFiles.guarantorAdditionalDocs) {
            const file = guarantorFiles.guarantorAdditionalDocs[docIdx];
            const description = guarantorDocDescriptions[docIdx] || `Guarantor Document ${docIdx + 1}`;
            
            guarantorSpecificDocs.push({
              description,
              file
            });
          }
        }

        if (guarantorSpecificDocs.length > 0) {
          console.log(`📄 Saving ${guarantorSpecificDocs.length} documents for guarantor ${i + 1}: ${guarantorData.name}`);
          await this.saveGuarantorDocuments(savedGuarantor.id, guarantorSpecificDocs, queryRunner);
        }
      }
    }
  }
  console.log(`✅ ${collateralData.guarantorsData.length} additional guarantors created with documents`);
}

      let shareholdersCount = 0;
      let shareholderDocumentsUploaded = 0;

      if (borrowerType === BorrowerType.INSTITUTION &&
        loanData.shareholderBoardMembers &&
        loanData.shareholderBoardMembers.length > 0) {

        console.log(`🔍 STEP 6: PROCESS ${loanData.shareholderBoardMembers.length} SHAREHOLDER/BOARD MEMBERS`);

        const processedMembers: ShareholderBoardMemberInfo[] = [];

        for (const member of loanData.shareholderBoardMembers) {
          const processedMember: ShareholderBoardMemberInfo = { ...member };

          // Upload shareholder/board member documents
          if (institutionFiles.shareholderIdentification || institutionFiles.boardMemberIdentification) {
            processedMember.documents = {};

            // Upload identification documents
            if (member.type === 'shareholder' && institutionFiles.shareholderIdentification) {
              for (const file of institutionFiles.shareholderIdentification) {
                const uploadedFile = await UploadToCloud(file);
                if (!processedMember.documents!.identificationUrl) {
                  processedMember.documents!.identificationUrl = uploadedFile.secure_url;
                }
                shareholderDocumentsUploaded++;
              }
            } else if (member.type === 'board_member' && institutionFiles.boardMemberIdentification) {
              for (const file of institutionFiles.boardMemberIdentification) {
                const uploadedFile = await UploadToCloud(file);
                if (!processedMember.documents!.identificationUrl) {
                  processedMember.documents!.identificationUrl = uploadedFile.secure_url;
                }
                shareholderDocumentsUploaded++;
              }
            }

            // Upload proof of shares for shareholders
            if (member.type === 'shareholder' && institutionFiles.proofOfShares) {
              for (const file of institutionFiles.proofOfShares) {
                const uploadedFile = await UploadToCloud(file);
                if (!processedMember.documents!.proofOfSharesUrl) {
                  processedMember.documents!.proofOfSharesUrl = uploadedFile.secure_url;
                }
                shareholderDocumentsUploaded++;
              }
            }

            // Upload CRB reports
            if (member.type === 'shareholder' && institutionFiles.shareholderCrbReport) {
              for (const file of institutionFiles.shareholderCrbReport) {
                const uploadedFile = await UploadToCloud(file);
                if (!processedMember.documents!.crbReportUrl) {
                  processedMember.documents!.crbReportUrl = uploadedFile.secure_url;
                }
                shareholderDocumentsUploaded++;
              }
            }
          }

          // Process additional documents
          if (member.type === 'shareholder' && institutionFiles.shareholderAdditionalDocs) {
            if (!processedMember.additionalDocuments) {
              processedMember.additionalDocuments = [];
            }

            const additionalDocDescriptions = JSON.parse(loanData.shareholderAdditionalDocDescriptions || '[]');

            for (let i = 0; i < institutionFiles.shareholderAdditionalDocs.length; i++) {
              const file = institutionFiles.shareholderAdditionalDocs[i];
              const description = additionalDocDescriptions[i] || `Shareholder Document ${i + 1}`;

              const uploadedFile = await UploadToCloud(file);
              processedMember.additionalDocuments.push({
                description,
                fileUrl: uploadedFile.secure_url,
                uploadedAt: new Date()
              });
              shareholderDocumentsUploaded++;
            }
          } else if (member.type === 'board_member' && institutionFiles.boardMemberAdditionalDocs) {
            if (!processedMember.additionalDocuments) {
              processedMember.additionalDocuments = [];
            }

            const additionalDocDescriptions = JSON.parse(loanData.boardMemberAdditionalDocDescriptions || '[]');

            for (let i = 0; i < institutionFiles.boardMemberAdditionalDocs.length; i++) {
              const file = institutionFiles.boardMemberAdditionalDocs[i];
              const description = additionalDocDescriptions[i] || `Board Member Document ${i + 1}`;

              const uploadedFile = await UploadToCloud(file);
              processedMember.additionalDocuments.push({
                description,
                fileUrl: uploadedFile.secure_url,
                uploadedAt: new Date()
              });
              shareholderDocumentsUploaded++;
            }
          }

          if (member.type === 'shareholder' && member.isAlsoGuarantor === true) {
            console.log(`🔍 STEP 6.2: AUTO-CREATE SHAREHOLDER AS GUARANTOR: ${member.firstName} ${member.lastName}`);

            try {
              await this.createMemberAsGuarantor(
                member,
                'shareholder',
                savedLoan.id,
                savedCollateral.id,
                savedBorrower.id,
                organizationId,
                createdBy || 0,
                queryRunner
              );
              console.log(`✅ Shareholder ${member.firstName} ${member.lastName} created as guarantor`);
            } catch (error: any) {
              console.error(`❌ Failed to create shareholder as guarantor: ${error.message}`);
            }
          }

          if (member.type === 'board_member' && member.isAlsoGuarantor === true) {
            console.log(`🔍 STEP 6.1: AUTO-CREATE BOARD MEMBER AS GUARANTOR: ${member.firstName} ${member.lastName}`);

            try {
              await this.createMemberAsGuarantor(
                member,
                'board_member',
                savedLoan.id,
                savedCollateral.id,
                savedBorrower.id,
                organizationId,
                createdBy || 0,
                queryRunner
              );
              console.log(`✅ Board member ${member.firstName} ${member.lastName} created as guarantor`);
            } catch (error: any) {
              console.error(`❌ Failed to create board member as guarantor: ${error.message}`);
            }
          }
          processedMembers.push(processedMember);
          shareholdersCount++;
        }

        // Update loan with processed members
        savedLoan.shareholderBoardMembers = processedMembers;
        await queryRunner.manager.save(savedLoan);

        console.log(`✅ ${shareholdersCount} shareholder/board members processed with ${shareholderDocumentsUploaded} documents`);
      }

      // Upload institution documents with type separation
      console.log('🔍 STEP 7: UPLOAD INSTITUTION DOCUMENTS');
      if (borrowerType === BorrowerType.INSTITUTION && institutionFiles) {
        const uploadedInstitutionDocs: any = {
          institutionLegalDocumentUrl: null,
          institutionLicenseUrl: null,
          institutionTradingLicenseUrl: null,
          institutionRegistrationUrl: null
        };

        const uploadPromises: Promise<void>[] = [];

        // Upload institution legal document
        if (institutionFiles.institutionLegalDocument && institutionFiles.institutionLegalDocument.length > 0) {
          const file = institutionFiles.institutionLegalDocument[0];
          uploadPromises.push(
            UploadToCloud(file).then(uploadedFile => {
              uploadedInstitutionDocs.institutionLegalDocumentUrl = uploadedFile.secure_url;
            })
          );
        }

        // Upload institution license
        if (institutionFiles.institutionLicense && institutionFiles.institutionLicense.length > 0) {
          const file = institutionFiles.institutionLicense[0];
          uploadPromises.push(
            UploadToCloud(file).then(uploadedFile => {
              uploadedInstitutionDocs.institutionLicenseUrl = uploadedFile.secure_url;
            })
          );
        }

        // Upload institution trading license
        if (institutionFiles.institutionTradingLicense && institutionFiles.institutionTradingLicense.length > 0) {
          const file = institutionFiles.institutionTradingLicense[0];
          uploadPromises.push(
            UploadToCloud(file).then(uploadedFile => {
              uploadedInstitutionDocs.institutionTradingLicenseUrl = uploadedFile.secure_url;
            })
          );
        }

        // Upload institution registration
        if (institutionFiles.institutionRegistration && institutionFiles.institutionRegistration.length > 0) {
          const file = institutionFiles.institutionRegistration[0];
          uploadPromises.push(
            UploadToCloud(file).then(uploadedFile => {
              uploadedInstitutionDocs.institutionRegistrationUrl = uploadedFile.secure_url;
            })
          );
        }

        await Promise.all(uploadPromises);

        // Store institution document URLs as JSON with proper structure
        const uploadedUrls = [];
        if (uploadedInstitutionDocs.institutionLegalDocumentUrl) {
          uploadedUrls.push({
            type: 'institutionLegalDocument',
            url: uploadedInstitutionDocs.institutionLegalDocumentUrl
          });
        }
        if (uploadedInstitutionDocs.institutionLicenseUrl) {
          uploadedUrls.push({
            type: 'institutionLicense',
            url: uploadedInstitutionDocs.institutionLicenseUrl
          });
        }
        if (uploadedInstitutionDocs.institutionTradingLicenseUrl) {
          uploadedUrls.push({
            type: 'institutionTradingLicense',
            url: uploadedInstitutionDocs.institutionTradingLicenseUrl
          });
        }
        if (uploadedInstitutionDocs.institutionRegistrationUrl) {
          uploadedUrls.push({
            type: 'institutionRegistration',
            url: uploadedInstitutionDocs.institutionRegistrationUrl
          });
        }

        if (uploadedUrls.length > 0) {
          savedLoan.institutionLegalDocumentUrls = JSON.stringify(uploadedUrls);
          await queryRunner.manager.save(savedLoan);
          console.log(`✅ ${uploadedUrls.length} institution documents uploaded with type separation`);
        }
      }

      // Upload marriage-related documents for individual borrowers
      console.log('🔍 STEP 8: UPLOAD MARRIAGE-RELATED DOCUMENTS');
      if (borrowerType === BorrowerType.INDIVIDUAL && borrowerFiles) {
        const uploadedMarriageDocs: any = {
          marriageCertificateUrl: null,
          spouseCrbReportUrl: null,
          witnessCrbReportUrl: null
        };

        const uploadPromises: Promise<void>[] = [];

        if (borrowerFiles.marriageCertificate && borrowerFiles.marriageCertificate.length > 0) {
          const file = borrowerFiles.marriageCertificate[0];
          uploadPromises.push(
            UploadToCloud(file).then(uploadedFile => {
              uploadedMarriageDocs.marriageCertificateUrl = uploadedFile.secure_url;
            })
          );
        }

        if (borrowerFiles.spouseCrbReport && borrowerFiles.spouseCrbReport.length > 0) {
          const file = borrowerFiles.spouseCrbReport[0];
          uploadPromises.push(
            UploadToCloud(file).then(uploadedFile => {
              uploadedMarriageDocs.spouseCrbReportUrl = uploadedFile.secure_url;
            })
          );
        }

        if (borrowerFiles.witnessCrbReport && borrowerFiles.witnessCrbReport.length > 0) {
          const file = borrowerFiles.witnessCrbReport[0];
          uploadPromises.push(
            UploadToCloud(file).then(uploadedFile => {
              uploadedMarriageDocs.witnessCrbReportUrl = uploadedFile.secure_url;
            })
          );
        }

        await Promise.all(uploadPromises);

        // Store marriage documents as JSON with type separation
        const uploadedUrls = [];
        if (uploadedMarriageDocs.marriageCertificateUrl) {
          uploadedUrls.push({
            type: 'marriageCertificate',
            url: uploadedMarriageDocs.marriageCertificateUrl
          });
        }
        if (uploadedMarriageDocs.spouseCrbReportUrl) {
          uploadedUrls.push({
            type: 'spouseCrbReport',
            url: uploadedMarriageDocs.spouseCrbReportUrl
          });
        }
        if (uploadedMarriageDocs.witnessCrbReportUrl) {
          uploadedUrls.push({
            type: 'witnessCrbReport',
            url: uploadedMarriageDocs.witnessCrbReportUrl
          });
        }

        if (uploadedUrls.length > 0) {
          savedLoan.marriageCertificateUrls = JSON.stringify(uploadedUrls);
          await queryRunner.manager.save(savedLoan);
          console.log(`✅ ${uploadedUrls.length} marriage-related documents uploaded`);
        }
      }

      // Create initial workflow step
      console.log('🔍 STEP 9: CREATE INITIAL WORKFLOW STEP');
      const workflow = queryRunner.manager.create(LoanWorkflow, {
        loanId: savedLoan.id,
        // step: WorkflowStep.SUBMITTED,
        status: 'completed',
        actionBy: createdBy || null,
        organizationId,
        notes: 'Loan application submitted',
        isActive: true,
        metadata: {
          borrowerType: savedLoan.borrowerType,
          loanAmount: savedLoan.disbursedAmount,
          collateralType: savedCollateral.collateralType,
          upiNumber: savedCollateral.upiNumber || null
        }
      });

      await queryRunner.manager.save(workflow);
      console.log('✅ Initial workflow step created');

      await queryRunner.commitTransaction();

      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║  LOAN APPLICATION CREATION COMPLETED SUCCESSFULLY               ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      return {
        success: true,
        message: "Loan application created successfully",
        data: {
          loan: savedLoan,
          borrower: savedBorrower,
          collateral: savedCollateral,
          spouseGuarantorCreated,
          guarantorsCount,
          institutionDocumentsCount: institutionRelevantDocs.length,
          status: savedLoan.status,
          clientAccountUpdated: hasClientAccount && existingClientAccount ? true : false,
          accountNumber: existingClientAccount?.accountNumber || null
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Transaction rolled back:', error);
      return {
        success: false,
        message: `Failed to create loan application: ${error.message}`,
        data: null
      };
    } finally {
      await queryRunner.release();
    }
  }
  
  private async createNewBorrower(
    borrowerData: BorrowerProfileData,
    organizationId: number,
    createdBy: number | null,
    queryRunner: any
  ): Promise<BorrowerProfile> {
    const borrowerId = `BRW${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const borrower = queryRunner.manager.create(BorrowerProfile, {
      borrowerId,
      ...borrowerData,
      organizationId,
      createdBy,
      isActive: true
    });
    const savedBorrower = await queryRunner.manager.save(BorrowerProfile, borrower);
    console.log(`✅ New borrower created: ${savedBorrower.fullName} (ID: ${savedBorrower.id})`);
    return savedBorrower;
  }

  private async uploadCollateralDocuments(
    collateral: LoanCollateral,
    collateralFiles: CollateralFiles,
    createdBy: number | null,
    additionalDocDescriptionsJson?: string,
    queryRunner?: any
  ): Promise<void> {
    const uploadPromises: Promise<void>[] = [];
    let uploadedCount = 0;

    // Upload standard collateral documents (keeping existing logic)
    if (collateralFiles.proofOfOwnership && collateralFiles.proofOfOwnership.length > 0) {
      for (const file of collateralFiles.proofOfOwnership) {
        uploadPromises.push(
          UploadToCloud(file).then(uploadedFile => {
            collateral.addDocumentUrl('proofOfOwnership', uploadedFile.secure_url);
            uploadedCount++;
          })
        );
      }
    }

    if (collateralFiles.upiFile && collateralFiles.upiFile.length > 0) {
      for (const file of collateralFiles.upiFile) {
        uploadPromises.push(
          UploadToCloud(file).then(uploadedFile => {
            console.log(`✅ Uploaded UPI document: ${file.originalname}`);
            collateral.addDocumentUrl('upiDocument', uploadedFile.secure_url);
            uploadedCount++;
          }).catch(error => {
            console.error(`❌ Failed to upload UPI document: ${error}`);
          })
        );
      }
    }
    if (collateralFiles.ownerIdentification && collateralFiles.ownerIdentification.length > 0) {
      for (const file of collateralFiles.ownerIdentification) {
        uploadPromises.push(
          UploadToCloud(file).then(uploadedFile => {
            collateral.addDocumentUrl('ownerIdentification', uploadedFile.secure_url);
            uploadedCount++;
          })
        );
      }
    }

    if (collateralFiles.legalDocument && collateralFiles.legalDocument.length > 0) {
      for (const file of collateralFiles.legalDocument) {
        uploadPromises.push(
          UploadToCloud(file).then(uploadedFile => {
            collateral.addDocumentUrl('legalDocument', uploadedFile.secure_url);
            uploadedCount++;
          })
        );
      }
    }

    if (collateralFiles.physicalEvidence && collateralFiles.physicalEvidence.length > 0) {
      for (const file of collateralFiles.physicalEvidence) {
        uploadPromises.push(
          UploadToCloud(file).then(uploadedFile => {
            collateral.addDocumentUrl('physicalEvidence', uploadedFile.secure_url);
            uploadedCount++;
          })
        );
      }
    }

    if (collateralFiles.valuationReport && collateralFiles.valuationReport.length > 0) {
      for (const file of collateralFiles.valuationReport) {
        uploadPromises.push(
          UploadToCloud(file).then(uploadedFile => {
            collateral.addDocumentUrl('valuationReport', uploadedFile.secure_url);
            uploadedCount++;
          })
        );
      }
    }

    // ✅ FIXED: Upload additional collateral documents with correct descriptions
    if (collateralFiles.additionalCollateralDocs && collateralFiles.additionalCollateralDocs.length > 0) {
      let additionalDocDescriptions: string[] = [];

      if (additionalDocDescriptionsJson) {
        try {
          additionalDocDescriptions = typeof additionalDocDescriptionsJson === 'string'
            ? JSON.parse(additionalDocDescriptionsJson)
            : additionalDocDescriptionsJson;
        } catch (e) {
          console.error('❌ Failed to parse additional collateral doc descriptions:', e);
          additionalDocDescriptions = [];
        }
      }

      console.log(`   Processing ${collateralFiles.additionalCollateralDocs.length} additional collateral documents`);
      console.log(`   With ${additionalDocDescriptions.length} descriptions`);

      for (let i = 0; i < collateralFiles.additionalCollateralDocs.length; i++) {
        const file = collateralFiles.additionalCollateralDocs[i];
        const description = additionalDocDescriptions[i] || `Additional collateral document ${i + 1}`;

        const index = i; // Capture index for closure
        uploadPromises.push(
          UploadToCloud(file).then(uploadedFile => {
            console.log(`   Uploaded additional collateral doc ${index + 1}: ${description}`);
            collateral.addAdditionalDocument(description, uploadedFile.secure_url, 'additional');
            uploadedCount++;
          })
        );
      }
    }

    await Promise.all(uploadPromises);

    if (uploadedCount > 0) {
      if (queryRunner) {
        await queryRunner.manager.save(LoanCollateral, collateral);
      } else {
        await this.collateralRepository.save(collateral);
      }
      console.log(`✅ ${uploadedCount} collateral documents uploaded and saved (including UPI)`);
    }
  }

// ✅ ADD THIS METHOD: Verify borrower documents were saved
async verifyBorrowerDocuments(borrowerId: number): Promise<ServiceResponse> {
  try {
    const borrower = await this.borrowerRepository.findOne({
      where: { id: borrowerId, isActive: true }
    });

    if (!borrower) {
      return {
        success: false,
        message: `Borrower with ID ${borrowerId} not found`
      };
    }

    const documents = borrower.borrowerDocuments || [];
    
    console.log(`🔍 Borrower Documents Verification for ID ${borrowerId}:`);
    console.log(`   Borrower: ${borrower.fullName} (${borrower.borrowerId})`);
    console.log(`   Total Documents: ${documents.length}`);
    
    documents.forEach((doc, index) => {
      console.log(`   [${index}] Type: ${doc.documentType}`);
      console.log(`        URL: ${doc.documentUrl}`);
      console.log(`        Uploaded: ${doc.uploadedAt}`);
    });

    return {
      success: true,
      message: `Found ${documents.length} borrower documents`,
      data: {
        borrowerId: borrower.id,
        borrowerName: borrower.fullName,
        documentCount: documents.length,
        documents: documents
      }
    };
    
  } catch (error: any) {
    console.error('❌ Error verifying borrower documents:', error);
    return {
      success: false,
      message: `Failed to verify borrower documents: ${error.message}`
    };
  }
}

async saveBorrowerDocuments(
  borrowerId: number,
  documents: Array<{ description: string; file: Express.Multer.File }>,
  uploadedBy: number,
  queryRunner?: any
): Promise<BorrowerDocument[]> {
  try {
    console.log(`📁 Saving ${documents.length} borrower documents for borrower ID: ${borrowerId}`);
    
    // ✅ FIX: Proper repository selection with explicit relations
    const borrower = queryRunner
      ? await queryRunner.manager.findOne(BorrowerProfile, { 
          where: { id: borrowerId } 
        })
      : await this.borrowerRepository.findOne({ 
          where: { id: borrowerId } 
        });

    if (!borrower) {
      throw new Error(`Borrower with ID ${borrowerId} not found`);
    }

    const savedDocuments: BorrowerDocument[] = [];

    for (const doc of documents) {
      try {
        console.log(`📤 Uploading borrower document: ${doc.file.originalname} - ${doc.description}`);
        
        const uploadedFile = await UploadToCloud(doc.file);
        
        // ✅ CRITICAL FIX: Use the correct BorrowerDocument structure
        const borrowerDoc: BorrowerDocument = {
          documentType: doc.description, // Using description as documentType
          documentUrl: uploadedFile.secure_url,
          uploadedAt: new Date(),
          uploadedBy
        };

        savedDocuments.push(borrowerDoc);
        console.log(`✅ Uploaded: ${uploadedFile.secure_url}`);
        
      } catch (uploadError: any) {
        console.error(`❌ Failed to upload borrower document ${doc.file.originalname}:`, uploadError.message);
        throw new Error(`Failed to upload borrower document: ${uploadError.message}`);
      }
    }

    // ✅ CRITICAL FIX: Initialize array if it doesn't exist
    if (!borrower.borrowerDocuments) {
      borrower.borrowerDocuments = [];
    }

    // ✅ Add all new documents
    borrower.borrowerDocuments.push(...savedDocuments);
    
    console.log(`📊 Borrower had ${borrower.borrowerDocuments.length - savedDocuments.length} existing documents`);
    console.log(`📊 Now has ${borrower.borrowerDocuments.length} total documents`);

    // ✅ Save the borrower with documents
    if (queryRunner) {
      await queryRunner.manager.save(BorrowerProfile, borrower);
    } else {
      await this.borrowerRepository.save(borrower);
    }

    console.log(`✅ Successfully saved ${savedDocuments.length} borrower documents for borrower ID: ${borrowerId}`);
    
    return savedDocuments;
    
  } catch (error: any) {
    console.error('❌ Error saving borrower documents:', error);
    throw new Error(`Failed to save borrower documents: ${error.message}`);
  }
}
async saveGuarantorDocuments(
  guarantorId: number,
  documents: Array<{ description: string; file: Express.Multer.File }>,
  queryRunner?: any
): Promise<void> {
  try {
    console.log(`📁 Saving ${documents.length} documents for guarantor ID: ${guarantorId}`);
    
    const guarantor = queryRunner
      ? await queryRunner.manager.findOne(Guarantor, { where: { id: guarantorId } })
      : await this.guarantorRepository.findOne({ where: { id: guarantorId } });

    if (!guarantor) {
      throw new Error(`Guarantor with ID ${guarantorId} not found`);
    }

    // ✅ CRITICAL: Initialize guarantorDocuments array if it doesn't exist
    if (!guarantor.guarantorDocuments) {
      guarantor.guarantorDocuments = [];
    }

    for (const doc of documents) {
      try {
        console.log(`📤 Uploading file: ${doc.file.originalname} - ${doc.description}`);
        const uploadedFile = await UploadToCloud(doc.file);
        
        // ✅ FIX: Use addGuarantorDocument method
        guarantor.addGuarantorDocument(doc.description, uploadedFile.secure_url);
        
        console.log(`✅ Uploaded: ${uploadedFile.secure_url}`);
      } catch (uploadError: any) {
        console.error(`❌ Failed to upload document ${doc.file.originalname}:`, uploadError.message);
        throw new Error(`Failed to upload guarantor document: ${uploadError.message}`);
      }
    }

    // ✅ Save the guarantor with documents
    if (queryRunner) {
      await queryRunner.manager.save(Guarantor, guarantor);
    } else {
      await this.guarantorRepository.save(guarantor);
    }

    console.log(`✅ Successfully saved ${documents.length} documents for guarantor ID: ${guarantorId}`);
    
  } catch (error: any) {
    console.error('❌ Error saving guarantor documents:', error);
    throw new Error(`Failed to save guarantor documents: ${error.message}`);
  }
}

  private async saveLoanRelevantDocuments(
    loanId: number,
    documents: Array<{ description: string; file: Express.Multer.File }>,
    uploadedBy: number,
    queryRunner?: any
  ): Promise<void> {
    try {
      const loan = queryRunner
        ? await queryRunner.manager.findOne(Loan, { where: { id: loanId } })
        : await this.loanRepository.findOne({ where: { id: loanId } });

      if (!loan) {
        throw new Error(`Loan with ID ${loanId} not found`);
      }

      const relevantDocuments: LoanRelevantDocument[] = [];

      for (const doc of documents) {
        const uploadedFile = await UploadToCloud(doc.file);

        relevantDocuments.push({
          description: doc.description,
          fileUrl: uploadedFile.secure_url,
          fileName: doc.file.originalname,
          uploadedAt: new Date().toISOString(),
          uploadedBy
        });
      }

      // Merge with existing documents
      const existingDocuments = loan.loanRelevantDocuments || [];
      loan.loanRelevantDocuments = [...existingDocuments, ...relevantDocuments];

      // Save loan with documents
      if (queryRunner) {
        await queryRunner.manager.save(Loan, loan);
      } else {
        await this.loanRepository.save(loan);
      }

      console.log(`✅ Saved ${relevantDocuments.length} loan relevant documents`);
    } catch (error: any) {
      console.error('Error saving loan relevant documents:', error);
      throw new Error(`Failed to save loan relevant documents: ${error.message}`);
    }
  }
  async createMemberAsGuarantor(
    member: ShareholderBoardMemberInfo,
    memberType: 'shareholder' | 'board_member',
    loanId: number,
    collateralId: number,
    borrowerId: number,
    organizationId: number,
    createdBy: number,
    queryRunner?: any // ✅ Make this optional
  ): Promise<Guarantor> {
    try {
      // ✅ Use queryRunner if provided, otherwise use repository
      const loan = queryRunner
        ? await queryRunner.manager.findOne(Loan, { where: { id: loanId } })
        : await this.loanRepository.findOne({ where: { id: loanId } });

      if (!loan) {
        throw new Error(`Loan with ID ${loanId} not found`);
      }

      const collateral = queryRunner
        ? await queryRunner.manager.findOne(LoanCollateral, { where: { id: collateralId } })
        : await this.collateralRepository.findOne({ where: { id: collateralId } });

      if (!collateral) {
        throw new Error(`Collateral with ID ${collateralId} not found`);
      }

      const position = memberType === 'board_member'
        ? `Board Member - ${member.position || 'N/A'}`
        : `Shareholder - ${member.sharePercentage ? `${member.sharePercentage}%` : 'N/A'}`;

      // Create guarantor data
      const guarantorData = {
        name: `${member.firstName} ${member.lastName}`,
        phone: member.phone,
        address: position,
        nationalId: member.nationalId,
        email: member.email || null,
        guarantorType: 'individual',
        guaranteedAmount: memberType === 'shareholder'
          ? (loan.disbursedAmount * (member.sharePercentage || 0)) / 100
          : loan.disbursedAmount * 0.1,
        collateralType: collateral.collateralType,
        upiNumber: collateral.upiNumber,
        collateralDescription: collateral.description,
        loanId,
        collateralId,
        borrowerId,
        organizationId,
        createdBy,
        isActive: true,
        isShareholderGuarantor: memberType === 'shareholder',
        isBoardMemberGuarantor: memberType === 'board_member',
        memberPosition: member.position,
        sharePercentage: member.sharePercentage,
        memberType: memberType
      };

      let savedGuarantor: Guarantor;

      if (queryRunner) {
        const guarantor = queryRunner.manager.create(Guarantor, guarantorData);
        savedGuarantor = await queryRunner.manager.save(Guarantor, guarantor);
      } else {
        const guarantor = this.guarantorRepository.create(guarantorData);
        savedGuarantor = await this.guarantorRepository.save(guarantor);
      }

      console.log(`✅ ${memberType === 'shareholder' ? 'Shareholder' : 'Board member'} ${member.firstName} ${member.lastName} created as guarantor for loan ${loanId}`);

      return savedGuarantor;
    } catch (error: any) {
      console.error(`Error creating ${memberType} as guarantor:`, error);
      throw new Error(`Failed to create ${memberType} as guarantor: ${error.message}`);
    }
  }

  async rejectAndCloseLoan(
    loanId: number,
    rejectionReason: string,
    rejectedBy: number,
    organizationId: number,
    notes?: string,
    loanAnalysisNote?: string
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    console.log('=== REJECT AND CLOSE LOAN START ===');

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // 1. Find the loan with borrower
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'organization']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // 2. Verify loan is PENDING (can only reject pending loans)
      if (loan.status !== LoanStatus.PENDING) {
        throw new Error(`Cannot reject and close loan with status: ${loan.status}. Only PENDING loans can be rejected and closed.`);
      }

      // 3. Validate rejection reason
      if (!rejectionReason || rejectionReason.trim().length < 10) {
        throw new Error("Rejection reason must be at least 10 characters");
      }

      // 4. Get user who is rejecting
      const rejector = await this.userRepository.findOne({
        where: { id: rejectedBy, organizationId }
      });

      if (!rejector) {
        throw new Error("Rejector user not found");
      }

      // 5. Verify user is Managing Director
      if (rejector.role !== UserRole.MANAGING_DIRECTOR && rejector.role !== UserRole.CLIENT) {
        throw new Error("Only Managing Director can reject and close loans");
      }

      const now = new Date();

      // 6. Update loan with rejection and completion data
      await queryRunner.manager.update(Loan, loanId, {
        status: LoanStatus.COMPLETED,
        rejectionAndCloseReason: rejectionReason.trim(),
        rejectedAndClosedBy: rejectedBy,
        rejectedAndClosedAt: now,
        isCompleted: true,
        completedAt: now,
        completionType: 'rejected_close',
        notes: notes || loan.notes,
        rejectAndCloseAnalysisNote: loanAnalysisNote || null, // ✅ NEW: Store loan analysis note
        updatedAt: now
      });

      console.log('✓ Loan rejected and closed');

      // ✅ NEW: Create a review record for the rejection with loanAnalysisNote
      const review = this.loanReviewRepository.create({
        loanId,
        reviewedBy: rejectedBy,
        reviewMessage: rejectionReason.trim(),
        status: ReviewStatus.REVIEWED,
        organizationId,
        reviewerRole: WorkflowStep.MANAGING_DIRECTOR,
        workflowStep: 4,
        decision: ReviewDecision.REJECT,
        loanAnalysisNote: loanAnalysisNote || null, // ✅ NEW: Store in review
        reviewedAt: now
      });

      await queryRunner.manager.save(review);
      console.log('✓ Review saved with rejection analysis note');

      await queryRunner.commitTransaction();

      // 7. Send rejection email to borrower
      try {
        if (loan.borrower?.email) {
          await sendLoanRejectionEmail(
            loan.borrower.email,
            loan.borrower.fullName,
            loan.loanId,
            loan.disbursedAmount,
            rejectionReason
          );
          console.log('✓ Rejection email sent');
        }
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the rejection if email fails
      }

      // 8. Load complete rejected loan
      const completedLoan = await this.loanRepository.findOne({
        where: { id: loanId },
        relations: ['borrower', 'collaterals', 'organization', 'reviews']
      });

      return {
        success: true,
        message: "Loan rejected and closed successfully. This loan is now completed and cannot be modified.",
        data: {
          loan: completedLoan,
          rejectionDetails: {
            rejectedBy,
            rejectedAt: now,
            rejectionReason: rejectionReason.trim(),
            loanAnalysisNote: loanAnalysisNote || null, // ✅ NEW: Include in response
            completionType: 'rejected_close',
            isCompleted: true,
            notes
          }
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("=== REJECT AND CLOSE LOAN ERROR ===", error);

      return {
        success: false,
        message: error.message || "Failed to reject and close loan",
      };
    } finally {
      await queryRunner.release();
    }
  }


  async approveAndCloseLoan(
    loanId: number,
    approvalReason: string,
    approvedBy: number,
    organizationId: number,
    notes?: string,
    loanAnalysisNote?: string
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    console.log('=== APPROVE AND CLOSE LOAN START ===');

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // 1. Find the loan
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'organization']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // 2. Verify loan is PENDING
      if (loan.status !== LoanStatus.PENDING) {
        throw new Error(`Cannot approve and close loan with status: ${loan.status}. Only PENDING loans can be approved and closed.`);
      }

      // 3. Validate approval reason
      if (!approvalReason || approvalReason.trim().length < 10) {
        throw new Error("Approval reason must be at least 10 characters");
      }

      // 4. Get approver information
      const approver = await this.userRepository.findOne({
        where: { id: approvedBy, organizationId }
      });

      if (!approver) {
        throw new Error("Approver user not found");
      }

      // 5. Verify user is Managing Director
      if (approver.role !== UserRole.MANAGING_DIRECTOR && approver.role !== UserRole.CLIENT) {
        throw new Error("Only Managing Director can approve and close loans");
      }

      const now = new Date();

      // 6. Update loan with approval and completion data
      await queryRunner.manager.update(Loan, loanId, {
        status: LoanStatus.COMPLETED,
        approvalAndCloseReason: approvalReason.trim(),
        approvedAndClosedBy: approvedBy,
        approvedAndClosedAt: now,
        approvedBy,
        approvedAt: now,
        isCompleted: true,
        completedAt: now,
        completionType: 'approved_close',
        approveAndCloseAnalysisNote: loanAnalysisNote || null, // ✅ NEW: Store loan analysis note
        updatedAt: now
      });

      console.log('✓ Loan approved and closed');

      // ✅ NEW: Create a review record for the approval with loanAnalysisNote
      const review = this.loanReviewRepository.create({
        loanId,
        reviewedBy: approvedBy,
        reviewMessage: approvalReason.trim(),
        status: ReviewStatus.REVIEWED,
        organizationId,
        reviewerRole: WorkflowStep.MANAGING_DIRECTOR,
        workflowStep: 4,
        decision: ReviewDecision.APPROVE,
        loanAnalysisNote: loanAnalysisNote || null, // ✅ NEW: Store in review
        reviewedAt: now
      });

      await queryRunner.manager.save(review);
      console.log('✓ Review saved with approval analysis note');

      // 7. Reload loan with updated data
      const updatedLoan = await queryRunner.manager.findOne(Loan, {
        where: { id: loanId }
      });

      if (!updatedLoan) {
        throw new Error("Failed to reload approved loan");
      }

      // 8. Generate repayment schedule
      const repaymentSchedule = this.generateRepaymentSchedule(updatedLoan);
      console.log(`✓ Generated ${repaymentSchedule.length} repayment schedules`);

      // 9. Save repayment schedule
      const savedSchedule = await queryRunner.manager.save(RepaymentSchedule, repaymentSchedule);
      console.log('✓ Repayment schedule saved');

      await queryRunner.commitTransaction();

      // 10. Load complete loan with all relations
      const completedLoan = await this.loanRepository.findOne({
        where: { id: loanId },
        relations: ['borrower', 'collaterals', 'repaymentSchedules', 'organization', 'reviews']
      });

      return {
        success: true,
        message: "Loan approved and closed successfully. This loan is now completed and cannot be modified.",
        data: {
          loan: completedLoan,
          approvalDetails: {
            approvedBy,
            approvedAt: now,
            approvalReason: approvalReason.trim(),
            loanAnalysisNote: loanAnalysisNote || null, // ✅ NEW: Include in response
            completionType: 'approved_close',
            isCompleted: true,
          }
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("=== APPROVE AND CLOSE LOAN ERROR ===", error);

      return {
        success: false,
        message: error.message || "Failed to approve and close loan",
      };
    } finally {
      await queryRunner.release();
    }
  }


  // This method now includes complete guarantor information as an array of objects
  async getPendingLoanApplicationsWithWorkflow(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    statusFilter?: 'pending' | 'rejected' | 'all' | 'completed',
    userRole?: string
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const queryBuilder = this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.collaterals', 'collaterals')
        .leftJoinAndSelect('loan.organization', 'organization')
        .leftJoinAndSelect('loan.reviews', 'reviews')
        .leftJoinAndSelect('reviews.reviewer', 'reviewer')
        .leftJoinAndSelect('loan.analysisReports', 'analysisReports')
        .leftJoinAndSelect('analysisReports.loanOfficer', 'reportLoanOfficer')
        .leftJoinAndSelect('analysisReports.managingDirector', 'reportManagingDirector')
        .leftJoinAndSelect('analysisReports.creator', 'reportCreator')
        // ✅ NEW: Add guarantors relationship
        .leftJoinAndSelect('loan.guarantors', 'guarantors')
        .leftJoinAndSelect('guarantors.collateral', 'guarantorCollateral')
        .where('loan.organizationId = :organizationId', { organizationId });

      // ✅ PRESERVED: All original filtering logic (100% unchanged)
      if (statusFilter === 'completed') {
        queryBuilder.andWhere('loan.isCompleted = :isCompleted', { isCompleted: true });
        queryBuilder.andWhere('loan.status = :status', { status: LoanStatus.COMPLETED });
      } else {
        if (userRole !== UserRole.MANAGING_DIRECTOR && userRole !== UserRole.CLIENT) {
          queryBuilder.andWhere(
            '(loan.isCompleted = :isCompleted OR ' +
            '(loan.isCompleted = :isCompletedTrue AND loan.completionType = :approvedClose))',
            {
              isCompleted: false,
              isCompletedTrue: true,
              approvedClose: 'approved_close'
            }
          );
        }

        if (statusFilter === 'pending') {
          queryBuilder.andWhere(
            '(loan.status = :pendingStatus OR ' +
            '(loan.status = :completedStatus AND loan.completionType = :approvedClose))',
            {
              pendingStatus: LoanStatus.PENDING,
              completedStatus: LoanStatus.COMPLETED,
              approvedClose: 'approved_close'
            }
          );
        } else if (statusFilter === 'rejected') {
          queryBuilder.andWhere(
            '(loan.status = :rejectedStatus OR ' +
            '(loan.status = :completedStatus AND loan.completionType = :rejectedClose))',
            {
              rejectedStatus: LoanStatus.REJECTED,
              completedStatus: LoanStatus.COMPLETED,
              rejectedClose: 'rejected_close'
            }
          );
        } else if (statusFilter === 'all') {
          queryBuilder.andWhere(
            '(loan.status IN (:...statuses) OR ' +
            '(loan.status = :completedStatus AND loan.completionType IN (:...completionTypes)))',
            {
              statuses: [LoanStatus.PENDING, LoanStatus.REJECTED],
              completedStatus: LoanStatus.COMPLETED,
              completionTypes: ['approved_close', 'rejected_close']
            }
          );
        }
      }

      // ✅ PRESERVED: Original search logic
      if (search) {
        queryBuilder.andWhere(
          '(loan.loanId ILIKE :search OR loan.purposeOfLoan ILIKE :search OR ' +
          'borrower.firstName ILIKE :search OR borrower.lastName ILIKE :search OR ' +
          'borrower.nationalId ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      // ✅ PRESERVED: Original ordering
      if (statusFilter === 'rejected') {
        queryBuilder.orderBy('loan.rejectedAt', 'DESC', 'NULLS LAST');
        queryBuilder.addOrderBy('loan.rejectedAndClosedAt', 'DESC', 'NULLS LAST');
      } else if (statusFilter === 'completed') {
        queryBuilder.orderBy('loan.completedAt', 'DESC', 'NULLS LAST');
      } else if (statusFilter === 'pending') {
        queryBuilder
          .orderBy('loan.completionType', 'ASC', 'NULLS FIRST')
          .addOrderBy('loan.approvedAndClosedAt', 'DESC', 'NULLS LAST')
          .addOrderBy('loan.createdAt', 'DESC');
      } else {
        queryBuilder.orderBy('loan.createdAt', 'DESC');
      }

      queryBuilder.addOrderBy('reviews.createdAt', 'DESC', 'NULLS LAST');
      queryBuilder.addOrderBy('analysisReports.createdAt', 'DESC', 'NULLS LAST');
      // ✅ NEW: Order guarantors by creation date
      queryBuilder.addOrderBy('guarantors.createdAt', 'ASC', 'NULLS LAST');

      const [loans, totalItems] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      // ✅ ENHANCED: Map loans with workflow, analysis reports, AND guarantor information
      const loansWithWorkflow = await Promise.all(
        loans.map(async (loan) => {
          const workflow = await this.workflowRepository.findOne({
            where: {
              loanId: loan.id
            },
            relations: ['currentAssignee']
          });

          // ✅ PRESERVED: Original analysis report summary
          const analysisReportSummary = loan.analysisReports && loan.analysisReports.length > 0 ? {
            totalReports: loan.analysisReports.length,
            hasApprovedReport: loan.analysisReports.some(r => r.reportType === 'approve' && r.isFinalized),
            hasRejectedReport: loan.analysisReports.some(r => r.reportType === 'reject' && r.isFinalized),
            latestReport: loan.analysisReports.sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0],
            pendingReports: loan.analysisReports.filter(r => !r.isFinalized).length,
            finalizedReports: loan.analysisReports.filter(r => r.isFinalized).length,
            approvedReports: loan.analysisReports.filter(r => r.reportType === 'approve' && r.isFinalized),
            rejectedReports: loan.analysisReports.filter(r => r.reportType === 'reject' && r.isFinalized)
          } : null;

          // ✅ NEW: Build complete guarantor information array
          const guarantorInformation = loan.guarantors && loan.guarantors.length > 0
            ? loan.guarantors
              .filter(g => g.isActive) // Only include active guarantors
              .map(guarantor => ({
                // Basic Information
                id: guarantor.id,
                name: guarantor.name,
                fullName: guarantor.getFullName(), // Uses entity method
                phone: guarantor.phone,
                email: guarantor.email,
                address: guarantor.address,

                // Identification
                nationalId: guarantor.nationalId,
                passportNo: guarantor.passportNo,
                nationality: guarantor.nationality,

                // Type & Classification
                guarantorType: guarantor.guarantorType,
                accountNumber: guarantor.accountNumber,

                // Personal Details (for individuals)
                surname: guarantor.surname,
                forename1: guarantor.forename1,
                forename2: guarantor.forename2,
                forename3: guarantor.forename3,
                dateOfBirth: guarantor.dateOfBirth,
                placeOfBirth: guarantor.placeOfBirth,

                // Institution Details (for institutions)
                institutionName: guarantor.institutionName,
                tradingName: guarantor.tradingName,
                companyRegNo: guarantor.companyRegNo,
                companyRegistrationDate: guarantor.companyRegistrationDate,

                // Contact Information
                workTelephone: guarantor.workTelephone,
                homeTelephone: guarantor.homeTelephone,
                mobileTelephone: guarantor.mobileTelephone,

                // Postal Address
                postalAddress: {
                  line1: guarantor.postalAddressLine1,
                  line2: guarantor.postalAddressLine2,
                  town: guarantor.town,
                  postalCode: guarantor.postalCode,
                  country: guarantor.country
                },

                // Guarantee Details
                guaranteedAmount: guarantor.guaranteedAmount,
                collateralType: guarantor.collateralType,
                upiNumber: guarantor.upiNumber,
                collateralDescription: guarantor.collateralDescription,

                // Collateral Reference
                collateralId: guarantor.collateralId,
                collateralInfo: guarantor.collateral ? {
                  id: guarantor.collateral.id,
                  collateralId: guarantor.collateral.collateralId,
                  type: guarantor.collateral.collateralType,
                  upiNumber: guarantor.collateral.upiNumber,
                  value: guarantor.collateral.collateralValue,
                  description: guarantor.collateral.description
                } : null,

                // Documents
                guarantorDocuments: guarantor.guarantorDocuments || [],
                identificationDocuments: guarantor.getIdentificationDocuments(),

                // Metadata
                isActive: guarantor.isActive,
                isExtended: guarantor.isExtended(),
                createdAt: guarantor.createdAt,
                updatedAt: guarantor.updatedAt,

                // Business Methods Results
                guaranteeCoverage: guarantor.getGuaranteeCoverage(loan.disbursedAmount),
                isValidGuarantor: guarantor.isValidGuarantor()
              }))
            : [];

          // ✅ NEW: Guarantor summary statistics
          const guarantorSummary = {
            totalGuarantors: guarantorInformation.length,
            totalGuaranteedAmount: guarantorInformation.reduce((sum, g) => sum + (g.guaranteedAmount || 0), 0),
            individualGuarantors: guarantorInformation.filter(g => g.guarantorType === 'individual').length,
            institutionGuarantors: guarantorInformation.filter(g => g.guarantorType === 'institution').length,
            averageGuaranteedAmount: guarantorInformation.length > 0
              ? guarantorInformation.reduce((sum, g) => sum + (g.guaranteedAmount || 0), 0) / guarantorInformation.length
              : 0,
            validGuarantors: guarantorInformation.filter(g => g.isValidGuarantor).length
          };

          return {
            ...loan,
            workflowInfo: workflow ? {
              id: workflow.id,
              currentStep: workflow.currentStep,
              currentAssigneeId: workflow.currentAssigneeId,
              currentAssignee: workflow.currentAssignee,
              status: workflow.status,
              isAssigned: !!workflow.currentAssigneeId,
              isAssignedToCurrentUser: workflow.currentAssigneeId === null
            } : null,
            analysisReportSummary,
            // ✅ NEW: Add guarantor information to response
            guarantorInformation,
            guarantorSummary
          };
        })
      );

      return {
        success: true,
        message: `Loan applications with workflow and guarantor details retrieved successfully`,
        data: loansWithWorkflow,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
        }
      };

    } catch (error: any) {
      console.error("Get loans with workflow error:", error);
      return {
        success: false,
        message: "Failed to retrieve loan applications with workflow and guarantor details"
      };
    }
  }

  async requestAdditionalDocuments(
    loanId: number,
    organizationId: number,
    requestedBy: number,
    requestReason: string,
    requestedDocuments: Array<{ description: string; reason: string }>
  ): Promise<ServiceResponse> {
    try {
      // Find the loan
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      // Check if loan is in a state where documents can be requested
      if (loan.status !== LoanStatus.PENDING && loan.status !== LoanStatus.APPROVED) {
        return {
          success: false,
          message: "Additional documents can only be requested for pending or approved loans"
        };
      }

      // Create document request structure
      const documentRequests: AdditionalDocumentRequest[] = requestedDocuments.map(doc => ({
        id: uuidv4(),
        description: doc.description,
        reason: doc.reason,
        requestedBy,
        requestedAt: new Date().toISOString(),
        status: 'pending' as const,
        uploadedFiles: []
      }));

      const documentRequestSummary: DocumentRequestSummary = {
        requestReason,
        requestedBy,
        requestedAt: new Date().toISOString(),
        requestedDocuments: documentRequests,
        status: 'pending'
      };

      // Update loan with document request
      loan.additionalDocumentRequests = documentRequestSummary;
      loan.hasDocumentRequest = true;
      loan.documentRequestedAt = new Date();
      loan.documentRequestedBy = requestedBy;

      await this.loanRepository.save(loan);

      console.log(`✅ Additional documents requested for loan ${loan.loanId} by user ${requestedBy}`);

      return {
        success: true,
        message: "Additional documents requested successfully",
        data: {
          loan,
          documentRequest: documentRequestSummary
        }
      };
    } catch (error: any) {
      console.error('Error requesting additional documents:', error);
      return {
        success: false,
        message: `Failed to request additional documents: ${error.message}`
      };
    }
  }


  async submitAdditionalDocuments(
    loanId: number,
    organizationId: number,
    uploadedBy: number,
    files: Express.Multer.File[],
    documentDescriptions: Array<{ documentId: string; description: string }>
  ): Promise<ServiceResponse> {
    try {
      // Find the loan
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      if (!loan.hasDocumentRequest || !loan.additionalDocumentRequests) {
        return {
          success: false,
          message: "No document request found for this loan"
        };
      }

      // Upload files and update document request
      const uploadedFiles: Array<{ fileUrl: string; fileName: string; uploadedAt: string; uploadedBy: number }> = [];

      for (const file of files) {
        try {
          const uploadResult = await UploadToCloud(file);
          uploadedFiles.push({
            fileUrl: uploadResult.secure_url,
            fileName: file.originalname,
            uploadedAt: new Date().toISOString(),
            uploadedBy
          });
        } catch (uploadError) {
          console.error(`Failed to upload file ${file.originalname}:`, uploadError);
        }
      }

      // Update document requests with uploaded files
      const updatedRequests = loan.additionalDocumentRequests.requestedDocuments.map(doc => {
        // Find matching description
        const matchingDesc = documentDescriptions.find(d => d.documentId === doc.id);

        if (matchingDesc) {
          // Find files for this document
          const docFiles = uploadedFiles.filter((_, index) => {
            const descIndex = documentDescriptions.indexOf(matchingDesc);
            return index === descIndex;
          });

          return {
            ...doc,
            uploadedFiles: [...(doc.uploadedFiles || []), ...docFiles],
            status: 'submitted' as const
          };
        }
        return doc;
      });

      // Update loan
      loan.additionalDocumentRequests = {
        ...loan.additionalDocumentRequests,
        requestedDocuments: updatedRequests,
        status: updatedRequests.every(doc => doc.status === 'submitted')
          ? 'completed'
          : 'partially_completed'
      };

      await this.loanRepository.save(loan);

      console.log(`✅ Additional documents submitted for loan ${loan.loanId} by user ${uploadedBy}`);

      return {
        success: true,
        message: "Additional documents submitted successfully",
        data: {
          loan,
          uploadedFiles,
          documentRequest: loan.additionalDocumentRequests
        }
      };
    } catch (error: any) {
      console.error('Error submitting additional documents:', error);
      return {
        success: false,
        message: `Failed to submit additional documents: ${error.message}`
      };
    }
  }


  async getDocumentRequestStatus(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      if (!loan.hasDocumentRequest || !loan.additionalDocumentRequests) {
        return {
          success: true,
          message: "No document request found",
          data: {
            hasRequest: false,
            loan
          }
        };
      }

      return {
        success: true,
        message: "Document request status retrieved",
        data: {
          hasRequest: true,
          loan,
          documentRequest: loan.additionalDocumentRequests
        }
      };
    } catch (error: any) {
      console.error('Error getting document request status:', error);
      return {
        success: false,
        message: `Failed to get document request status: ${error.message}`
      };
    }
  }


  async getLoansWithDocumentRequests(
    organizationId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const [loans, totalItems] = await this.loanRepository.findAndCount({
        where: {
          organizationId,
          hasDocumentRequest: true
        },
        relations: ['borrower'],
        order: {
          documentRequestedAt: 'DESC'
        },
        skip,
        take: limit
      });

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: "Loans with document requests retrieved successfully",
        data: loans,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error: any) {
      console.error('Error getting loans with document requests:', error);
      return {
        success: false,
        message: `Failed to get loans with document requests: ${error.message}`
      };
    }
  }

  private validateLoanCalculationInputs(
    disbursedAmount: number,
    annualInterestRate: number,
    termInMonths: number
  ): void {
    console.log('=== VALIDATION START ===');
    console.log('Input:', { disbursedAmount, annualInterestRate, termInMonths });

    // Ensure all inputs are numbers
    const disbursedAmountNum = Number(disbursedAmount);
    const annualInterestRateNum = Number(annualInterestRate);
    const termInMonthsNum = Number(termInMonths);

    // Business rule validations
    if (disbursedAmountNum < this.MIN_LOAN_AMOUNT) {
      throw new Error(`Minimum loan amount is ${this.MIN_LOAN_AMOUNT.toLocaleString()} RWF`);
    }

    if (disbursedAmountNum > this.MAX_NUMERIC_VALUE) {
      throw new Error(`Disbursed amount exceeds database limit of ${this.MAX_NUMERIC_VALUE.toLocaleString()}`);
    }

    if (annualInterestRateNum < 0 || annualInterestRateNum > 100) {
      throw new Error('Annual interest rate must be between 0% and 100%');
    }

    if (termInMonthsNum <= 0) {
      throw new Error('Term in months must be positive');
    }

    if (termInMonthsNum > this.MAX_TERM_MONTHS) {
      throw new Error(`Maximum loan term is ${this.MAX_TERM_MONTHS} months (40 years)`);
    }

    // Pre-calculate to check for overflow potential - use converted numbers
    const estimatedTotalInterest = disbursedAmountNum * (annualInterestRateNum / 100) * (termInMonthsNum / 12);
    const estimatedTotal = disbursedAmountNum + estimatedTotalInterest;
    const estimatedMonthlyPayment = estimatedTotal / termInMonthsNum;

    console.log('Estimated values:', {
      estimatedTotalInterest,
      estimatedTotal,
      estimatedMonthlyPayment
    });

    // Convert to numbers before comparison and formatting
    const estimatedTotalNum = Number(estimatedTotal);
    const estimatedMonthlyPaymentNum = Number(estimatedMonthlyPayment);

    if (estimatedTotalNum > this.MAX_NUMERIC_VALUE) {
      throw new Error(
        `Loan parameters would result in total amount (${estimatedTotalNum.toFixed(2)}) ` +
        `exceeding database limit. Please reduce loan amount or terms.`
      );
    }

    if (estimatedMonthlyPaymentNum > this.MAX_NUMERIC_VALUE) {
      throw new Error(
        `Estimated monthly payment (${estimatedMonthlyPaymentNum.toFixed(2)}) ` +
        `would exceed database limit. Please increase loan term or reduce amount.`
      );
    }

    console.log('=== VALIDATION PASSED ===');
  }

  private calculateAutoTerms(
    disbursementDate: Date,
    agreedMaturityDate: Date,
    repaymentFrequency: RepaymentFrequency
  ): number {
    console.log('=== AUTO-TERM CALCULATION START ===');
    console.log('Input:', {
      disbursementDate: disbursementDate.toISOString(),
      agreedMaturityDate: agreedMaturityDate.toISOString(),
      repaymentFrequency
    });

    // Calculate time difference
    const diffTime = agreedMaturityDate.getTime() - disbursementDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Calculate months between dates
    const yearsDiff = agreedMaturityDate.getFullYear() - disbursementDate.getFullYear();
    const monthsDiff = agreedMaturityDate.getMonth() - disbursementDate.getMonth();
    const totalMonths = (yearsDiff * 12) + monthsDiff;

    let autoTerms: number;

    switch (repaymentFrequency) {
      case RepaymentFrequency.DAILY:
        autoTerms = Math.ceil(diffDays);
        break;

      case RepaymentFrequency.WEEKLY:
        autoTerms = Math.ceil(diffDays / 7);
        break;

      case RepaymentFrequency.BIWEEKLY:
        autoTerms = Math.ceil(diffDays / 14);
        break;

      case RepaymentFrequency.MONTHLY:
        autoTerms = Math.ceil(totalMonths);
        break;

      case RepaymentFrequency.QUARTERLY:
        autoTerms = Math.ceil(totalMonths / 3);
        break;

      case RepaymentFrequency.SEMI_ANNUALLY:
        autoTerms = Math.ceil(totalMonths / 6);
        break;

      case RepaymentFrequency.ANNUALLY:
        autoTerms = Math.ceil(totalMonths / 12);
        break;

      default:
        throw new Error(`Unsupported repayment frequency: ${repaymentFrequency}`);
    }

    // Validation
    if (autoTerms <= 0) {
      throw new Error('Calculated terms must be positive. Check disbursement and maturity dates.');
    }

    if (autoTerms > 480) { // Max 40 years monthly = 480 installments
      throw new Error(`Calculated terms (${autoTerms}) exceed maximum allowed (480 installments)`);
    }

    console.log('Auto-calculated terms:', autoTerms);
    console.log('=== AUTO-TERM CALCULATION END ===');

    return autoTerms;
  }

  // ============================================================================
  // ENHANCED: Calculate Loan Terms with Auto-Terms
  // ============================================================================

  private calculateLoanTerms(
    principal: number,
    annualInterestRate: number,
    disbursementDate: Date,
    maturityDate: Date, // Changed from termInMonths
    interestMethod: InterestMethod,
    repaymentFrequency: RepaymentFrequency,
    gracePeriodMonths: number = 0
  ): LoanTermsCalculation {
    console.log('=== ENHANCED LOAN TERMS CALCULATION START ===');

    // STEP 1: Validate inputs
    const safePrincipal = Number(principal);
    const safeRate = Number(annualInterestRate);

    this.validateLoanCalculationInputs(safePrincipal, safeRate, 1);

    // STEP 2: Auto-calculate number of terms based on dates and frequency
    const totalNumberOfInstallments = this.calculateAutoTerms(
      disbursementDate,
      maturityDate,
      repaymentFrequency
    );

    console.log('Auto-calculated installments:', totalNumberOfInstallments);

    // STEP 3: Calculate based on interest method
    let totalInterestAmount: number;
    let periodicInstallmentAmount: number;

    if (interestMethod === InterestMethod.FLAT) {
      const termYears = this.convertTermsToYears(totalNumberOfInstallments, repaymentFrequency);
      totalInterestAmount = safePrincipal * (safeRate / 100) * termYears;

      if (totalNumberOfInstallments === 0) {
        throw new Error('Number of terms cannot be zero');
      }
      periodicInstallmentAmount = (safePrincipal + totalInterestAmount) / totalNumberOfInstallments;
    } else {
      const periodicRate = this.getPeriodicRate(safeRate, repaymentFrequency);

      if (periodicRate === 0) {
        periodicInstallmentAmount = safePrincipal / totalNumberOfInstallments;
        totalInterestAmount = 0;
      } else {
        const powerFactor = Math.pow(1 + periodicRate, totalNumberOfInstallments);
        const denominator = powerFactor - 1;

        if (denominator === 0) {
          throw new Error('Invalid interest calculation - denominator is zero');
        }

        periodicInstallmentAmount = safePrincipal * (periodicRate * powerFactor) / denominator;
        totalInterestAmount = (periodicInstallmentAmount * totalNumberOfInstallments) - safePrincipal;
      }
    }

    // STEP 4: Round and validate results
    const roundedTotalInterest = Math.max(0, Math.round(totalInterestAmount * 100) / 100);
    const roundedPeriodicInstallment = Math.max(0, Math.round(periodicInstallmentAmount * 100) / 100);
    const totalAmountToBeRepaid = Math.round((safePrincipal + roundedTotalInterest) * 100) / 100;

    // STEP 5: Calculate dates
    const agreedFirstPaymentDate = this.calculateFirstPaymentDate(
      disbursementDate,
      repaymentFrequency,
      gracePeriodMonths
    );

    // Validate that first payment date is before maturity date
    if (agreedFirstPaymentDate >= maturityDate) {
      throw new Error('First payment date must be before maturity date');
    }

    const result: LoanTermsCalculation = {
      totalInterestAmount: roundedTotalInterest,
      totalAmountToBeRepaid,
      monthlyInstallmentAmount: roundedPeriodicInstallment,
      totalNumberOfInstallments,
      outstandingPrincipal: safePrincipal,
      agreedMaturityDate: maturityDate,
      agreedFirstPaymentDate,
      accruedInterestToDate: 0,
      daysInArrears: 0,
      status: LoanStatus.PENDING
    };

    console.log('Enhanced calculation result:', result);
    console.log('=== ENHANCED LOAN TERMS CALCULATION END ===');

    return result;
  }
  private getPeriodicRate(annualRate: number, frequency: RepaymentFrequency): number {
    const periodsPerYear: Record<RepaymentFrequency, number> = {
      [RepaymentFrequency.DAILY]: 365,
      [RepaymentFrequency.WEEKLY]: 52,
      [RepaymentFrequency.BIWEEKLY]: 26,
      [RepaymentFrequency.MONTHLY]: 12,
      [RepaymentFrequency.QUARTERLY]: 4,
      [RepaymentFrequency.SEMI_ANNUALLY]: 2,
      [RepaymentFrequency.ANNUALLY]: 1
    };

    return annualRate / 100 / periodsPerYear[frequency];
  }

  // 4. HELPER: Calculate first payment date
  private calculateFirstPaymentDate(
    disbursementDate: Date,
    frequency: RepaymentFrequency,
    gracePeriodMonths: number = 0
  ): Date {
    const firstPaymentDate = new Date(disbursementDate);

    // Add grace period
    if (gracePeriodMonths > 0) {
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() + gracePeriodMonths);
    }

    // Add one period based on frequency
    switch (frequency) {
      case RepaymentFrequency.DAILY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 1);
        break;
      case RepaymentFrequency.WEEKLY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 7);
        break;
      case RepaymentFrequency.BIWEEKLY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 14);
        break;
      case RepaymentFrequency.MONTHLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
        break;
      case RepaymentFrequency.QUARTERLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 3);
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 6);
        break;
      case RepaymentFrequency.ANNUALLY:
        firstPaymentDate.setFullYear(firstPaymentDate.getFullYear() + 1);
        break;
    }

    return firstPaymentDate;
  }
  private calculateInstallmentDueDate(
    firstPaymentDate: Date,
    installmentNumber: number,
    frequency: RepaymentFrequency
  ): Date {
    const dueDate = new Date(firstPaymentDate);

    switch (frequency) {
      case RepaymentFrequency.DAILY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1));
        break;
      case RepaymentFrequency.WEEKLY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1) * 7);
        break;
      case RepaymentFrequency.BIWEEKLY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1) * 14);
        break;
      case RepaymentFrequency.MONTHLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1));
        break;
      case RepaymentFrequency.QUARTERLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 3);
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 6);
        break;
      case RepaymentFrequency.ANNUALLY:
        dueDate.setFullYear(dueDate.getFullYear() + (installmentNumber - 1));
        break;
    }

    return dueDate;
  }


  private convertTermsToYears(terms: number, frequency: RepaymentFrequency): number {
    const termsPerYear: Record<RepaymentFrequency, number> = {
      [RepaymentFrequency.DAILY]: 365,
      [RepaymentFrequency.WEEKLY]: 52,
      [RepaymentFrequency.BIWEEKLY]: 26,
      [RepaymentFrequency.MONTHLY]: 12,
      [RepaymentFrequency.QUARTERLY]: 4,
      [RepaymentFrequency.SEMI_ANNUALLY]: 2,
      [RepaymentFrequency.ANNUALLY]: 1
    };

    return terms / termsPerYear[frequency];
  }

  async getLoanPerformanceMetrics(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['repaymentSchedules', 'transactions']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      // Get base metrics from entity
      const baseMetrics = loan.getPerformanceMetrics();

      // ENHANCED: Add comprehensive validation and formatting
      const validatedMetrics = this.validateAndFormatMetrics(baseMetrics, loan);

      return {
        success: true,
        message: "Performance metrics retrieved successfully",
        data: validatedMetrics
      };
    } catch (error: any) {
      console.error("Get performance metrics error:", error);
      return {
        success: false,
        message: "Failed to retrieve performance metrics"
      };
    }
  }

  private validateAndFormatMetrics(metrics: any, loan: Loan): any {
    // CRITICAL: Ensure all values are proper numbers
    const safeMetrics = { ...metrics };

    // Convert and validate each numeric field
    const numericFields = [
      'totalInstallments',
      'installmentsPaid',
      'installmentsOutstanding',
      'principalRepaid',
      'balanceOutstanding',
      'paymentCompletionRate',
      'principalRecoveryRate'
    ];

    numericFields.forEach(field => {
      if (safeMetrics[field] !== undefined) {
        // Convert to number and handle invalid values
        const numericValue = Number(safeMetrics[field]);
        safeMetrics[field] = isNaN(numericValue) ? 0 : numericValue;
      }
    });

    // CRITICAL: Additional validation for calculated fields
    if (safeMetrics.installmentsOutstanding < 0) {
      safeMetrics.installmentsOutstanding = 0;
    }

    if (safeMetrics.balanceOutstanding < 0) {
      safeMetrics.balanceOutstanding = 0;
    }

    // Ensure rates are between 0-100
    if (safeMetrics.paymentCompletionRate < 0) safeMetrics.paymentCompletionRate = 0;
    if (safeMetrics.paymentCompletionRate > 100) safeMetrics.paymentCompletionRate = 100;

    if (safeMetrics.principalRecoveryRate < 0) safeMetrics.principalRecoveryRate = 0;
    if (safeMetrics.principalRecoveryRate > 100) safeMetrics.principalRecoveryRate = 100;

    return safeMetrics;
  }

  async addLoanReview(
    loanId: number,
    reviewMessage: string,
    reviewedBy: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    console.log('=== ADD LOAN REVIEW START ===');

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // 1. Find the loan with borrower information
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'organization']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // 3. Validate review message
      if (!reviewMessage || reviewMessage.trim().length < 10) {
        throw new Error("Review message must be at least 10 characters");
      }

      // 4. Get reviewer information
      const reviewer = await this.userRepository.findOne({
        where: { id: reviewedBy, organizationId }
      });

      if (!reviewer) {
        throw new Error("Reviewer not found");
      }

      // 5. Create review
      const review = this.loanReviewRepository.create({
        loanId,
        reviewedBy,
        reviewMessage: reviewMessage.trim(),
        status: ReviewStatus.REVIEWED,
        organizationId
      });

      const savedReview = await queryRunner.manager.save(review);
      console.log('✓ Review saved:', savedReview.id);

      await queryRunner.commitTransaction();

      // 6. Get all reviews count
      const reviewCount = await this.loanReviewRepository.count({
        where: { loanId, isActive: true }
      });

      // 7. Send email notifications to clients and managing directors
      try {
        // ✅ FIXED: Get users with CLIENT and MANAGING_DIRECTOR roles
        const usersToNotify = await this.userRepository.find({
          where: [
            { organizationId, role: UserRole.CLIENT, isActive: true },
            { organizationId, role: UserRole.MANAGING_DIRECTOR, isActive: true }
          ]
        });

        const reviewUrl = `${process.env.FRONTEND_URL}/dashboard/client/loanmanagement/pendingLoan`;
        const reviewerName = `${reviewer.firstName || ''} ${reviewer.lastName || reviewer.username}`.trim();
        const borrowerName = `${loan.borrower.firstName} ${loan.borrower.lastName}`;

        // Send emails to all clients and managing directors
        const emailPromises = usersToNotify
          .filter(user => user.email && user.id !== reviewedBy) // Don't send to the reviewer themselves
          .map(user => {
            // ✅ FIXED: Map role to correct email role type
            let emailRole: 'client' | 'loan_officer' | 'board_director' | 'senior_manager' | 'managing_director';

            if (user.role === UserRole.CLIENT) {
              emailRole = 'client';
            } else if (user.role === UserRole.MANAGING_DIRECTOR) {
              emailRole = 'managing_director';
            } else if (user.role === UserRole.BOARD_DIRECTOR) {
              emailRole = 'board_director';
            } else if (user.role === UserRole.SENIOR_MANAGER) {
              emailRole = 'senior_manager';
            } else {
              emailRole = 'loan_officer';
            }

            return sendLoanReviewedEmail(
              user.email!,
              `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
              emailRole,
              borrowerName,
              loan.loanId,
              loan.disbursedAmount,
              reviewerName,
              reviewMessage,
              reviewCount,
              reviewUrl
            ).catch(error => {
              console.error(`Failed to send email to ${user.email}:`, error);
              return null; // Don't fail the entire operation if one email fails
            });
          });

        await Promise.all(emailPromises);
        console.log(`✓ Sent ${emailPromises.length} notification emails`);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the review addition if emails fail
      }

      // 8. Load complete review with relations
      const completeReview = await this.loanReviewRepository.findOne({
        where: { id: savedReview.id },
        relations: ['reviewer', 'loan', 'loan.borrower']
      });

      return {
        success: true,
        message: "Review added successfully and notifications sent",
        data: {
          review: completeReview,
          reviewCount,
          emailsSent: true
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("=== ADD LOAN REVIEW ERROR ===", error);

      return {
        success: false,
        message: error.message || "Failed to add loan review",
      };
    } finally {
      await queryRunner.release();
    }
  }

  async getLoanReviews(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      // Verify loan exists and belongs to organization
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId }
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      // Get all reviews
      const reviews = await this.loanReviewRepository.find({
        where: { loanId, isActive: true },
        relations: ['reviewer'],
        order: { createdAt: 'DESC' }
      });

      // Format reviews for response
      const formattedReviews = reviews.map(review => ({
        id: review.id,
        reviewMessage: review.reviewMessage,
        status: review.status,
        createdAt: review.createdAt,
        reviewer: {
          id: review.reviewer.id,
          name: `${review.reviewer.firstName || ''} ${review.reviewer.lastName || review.reviewer.username}`.trim(),
          email: review.reviewer.email,
          role: review.reviewer.role
        }
      }));

      return {
        success: true,
        message: "Reviews retrieved successfully",
        data: {
          reviews: formattedReviews,
          totalReviews: reviews.length
        }
      };

    } catch (error: any) {
      console.error("Get loan reviews error:", error);
      return {
        success: false,
        message: "Failed to retrieve loan reviews"
      };
    }
  }

  /**
   * Get review count for a loan
   */
  async getLoanReviewCount(loanId: number, organizationId: number): Promise<number> {
    try {
      const count = await this.loanReviewRepository.count({
        where: { loanId, organizationId, isActive: true }
      });
      return count;
    } catch (error) {
      console.error("Get review count error:", error);
      return 0;
    }
  }

  async getLoanGuarantors(loanId: number, organizationId: number): Promise<ServiceResponse> {
    try {
      const guarantors = await this.guarantorRepository.find({
        where: {
          loanId,
          organizationId,
          isActive: true
        },
        relations: ['collateral', 'borrower', 'loan'],
        order: { createdAt: 'DESC' }
      });

      return {
        success: true,
        message: "Guarantors retrieved successfully",
        data: guarantors
      };
    } catch (error: any) {
      console.error("Get loan guarantors error:", error);
      return {
        success: false,
        message: "Failed to retrieve guarantors",
      };
    }
  }

  // ✅ NEW: Method to update guarantor (if needed)
  async updateGuarantor(
    guarantorId: number,
    updateData: Partial<Guarantor>,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const guarantor = await this.guarantorRepository.findOne({
        where: { id: guarantorId, organizationId }
      });

      if (!guarantor) {
        return {
          success: false,
          message: "Guarantor not found",
        };
      }

      Object.assign(guarantor, updateData);
      const updatedGuarantor = await this.guarantorRepository.save(guarantor);

      return {
        success: true,
        message: "Guarantor updated successfully",
        data: updatedGuarantor
      };
    } catch (error: any) {
      console.error("Update guarantor error:", error);
      return {
        success: false,
        message: "Failed to update guarantor",
      };
    }
  }


  async approveLoanApplication(
    loanId: number,
    approvalData: LoanApprovalData,
    approvedBy: number,
    organizationId: number,
    notes?: string
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    console.log('=== APPROVE LOAN APPLICATION START ===');
    console.log('Approval data:', approvalData);

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // 1. Find the loan
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'organization']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // 2. Verify loan is PENDING
      if (loan.status !== LoanStatus.PENDING) {
        throw new Error(`Cannot approve loan with status: ${loan.status}. Only PENDING loans can be approved.`);
      }

      // 3. Validate approval data
      this.validateApprovalData(approvalData);

      // 4. Calculate loan terms using existing calculation logic
      const loanTerms = this.calculateLoanTerms(
        loan.disbursedAmount,
        approvalData.annualInterestRate,
        approvalData.disbursementDate,
        approvalData.agreedMaturityDate,
        approvalData.interestMethod,
        approvalData.repaymentFrequency,
        approvalData.gracePeriodMonths || 0
      );

      console.log('✓ Loan terms calculated:', loanTerms);

      // 5. Update loan with approval data and calculated terms
      await queryRunner.manager.update(Loan, loanId, {
        // Approval data
        annualInterestRate: approvalData.annualInterestRate,
        disbursementDate: approvalData.disbursementDate,
        repaymentFrequency: approvalData.repaymentFrequency,
        interestMethod: approvalData.interestMethod,
        gracePeriodMonths: approvalData.gracePeriodMonths || 0,
        // Calculated terms
        ...loanTerms,
        // Approval tracking
        status: LoanStatus.APPROVED,
        approvedBy,
        approvedAt: new Date(),
        notes: notes || loan.notes,
        updatedAt: new Date()
      });

      console.log('✓ Loan updated with approval data');

      // 6. Reload loan with updated data
      const updatedLoan = await queryRunner.manager.findOne(Loan, {
        where: { id: loanId }
      });

      if (!updatedLoan) {
        throw new Error("Failed to reload approved loan");
      }

      // 7. Generate repayment schedule
      const repaymentSchedule = this.generateRepaymentSchedule(updatedLoan);
      console.log(`✓ Generated ${repaymentSchedule.length} repayment schedules`);

      // 8. Save repayment schedule
      const savedSchedule = await queryRunner.manager.save(RepaymentSchedule, repaymentSchedule);
      console.log('✓ Repayment schedule saved');

      await queryRunner.commitTransaction();
      console.log('✓ Approval transaction committed');

      // 9. Send approval email
      try {
        await sendLoanApprovalEmail(
          loan.borrower.email,
          loan.borrower.fullName,
          loan.loanId,
          loan.disbursedAmount,
          approvalData.disbursementDate.toLocaleDateString(),
          loanTerms.agreedFirstPaymentDate.toLocaleDateString(),
          loanTerms.monthlyInstallmentAmount,
          loanTerms.totalAmountToBeRepaid,
          approvalData.agreedMaturityDate.toLocaleDateString()
        );
        console.log('✓ Approval email sent');
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the approval if email fails
      }

      // 10. Load complete approved loan
      const completeLoan = await this.loanRepository.findOne({
        where: { id: loanId },
        relations: ['borrower', 'collaterals', 'repaymentSchedules', 'organization']
      });

      return {
        success: true,
        message: "Loan approved successfully and repayment schedule generated",
        data: {
          loan: completeLoan,
          repaymentSchedule: savedSchedule,
          calculationSummary: {
            totalInterestAmount: loanTerms.totalInterestAmount,
            totalAmountToBeRepaid: loanTerms.totalAmountToBeRepaid,
            monthlyInstallmentAmount: loanTerms.monthlyInstallmentAmount,
            totalNumberOfInstallments: loanTerms.totalNumberOfInstallments,
            agreedMaturityDate: loanTerms.agreedMaturityDate,
            agreedFirstPaymentDate: loanTerms.agreedFirstPaymentDate
          },
          approvalDetails: {
            approvedBy,
            approvedAt: new Date(),
            notes
          }
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("=== APPROVE LOAN ERROR ===", error);

      return {
        success: false,
        message: error.message || "Failed to approve loan application",
      };
    } finally {
      await queryRunner.release();
    }
  }


  async rejectLoanApplication(
    loanId: number,
    rejectionReason: string,
    rejectedBy: number,
    organizationId: number,
    notes?: string
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    console.log('=== REJECT LOAN APPLICATION START ===');

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // 1. Find the loan
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'organization']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // 2. Verify loan is PENDING
      if (loan.status !== LoanStatus.PENDING) {
        throw new Error(`Cannot reject loan with status: ${loan.status}. Only PENDING loans can be rejected.`);
      }

      // 3. Validate rejection reason
      if (!rejectionReason || rejectionReason.trim().length < 10) {
        throw new Error("Rejection reason must be at least 10 characters");
      }

      // 4. Update loan with rejection data
      await queryRunner.manager.update(Loan, loanId, {
        status: LoanStatus.REJECTED,
        rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
        notes: notes || loan.notes,
        updatedAt: new Date()
      });

      console.log('✓ Loan rejected');

      await queryRunner.commitTransaction();

      // 5. Send rejection email
      try {
        await sendLoanRejectionEmail(
          loan.borrower.email,
          loan.borrower.fullName,
          loan.loanId,
          rejectionReason,
          loan.organization.email || 'support@organization.com',
          loan.organization.phone || ''
        );
        console.log('✓ Rejection email sent');
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }

      // 6. Load updated loan
      const rejectedLoan = await this.loanRepository.findOne({
        where: { id: loanId },
        relations: ['borrower', 'collaterals', 'organization']
      });

      return {
        success: true,
        message: "Loan application rejected successfully",
        data: {
          loan: rejectedLoan,
          rejectionDetails: {
            rejectedBy,
            rejectedAt: new Date(),
            rejectionReason,
            notes
          }
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("=== REJECT LOAN ERROR ===", error);

      return {
        success: false,
        message: error.message || "Failed to reject loan application",
      };
    } finally {
      await queryRunner.release();
    }
  }



  async getRejectedLoanApplications(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const queryBuilder = this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.collaterals', 'collaterals')
        .leftJoinAndSelect('loan.organization', 'organization')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere('loan.status = :status', { status: LoanStatus.REJECTED })
        .orderBy('loan.rejectedAt', 'DESC');

      if (search) {
        queryBuilder.andWhere(
          '(loan.loanId ILIKE :search OR loan.purposeOfLoan ILIKE :search OR ' +
          'borrower.firstName ILIKE :search OR borrower.lastName ILIKE :search OR ' +
          'borrower.nationalId ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      const [rejectedLoans, totalItems] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: "Rejected loan applications retrieved successfully",
        data: rejectedLoans,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
        }
      };

    } catch (error: any) {
      console.error("Get rejected loans error:", error);
      return {
        success: false,
        message: "Failed to retrieve rejected loan applications"
      };
    }
  }
  private validateApprovalData(approvalData: LoanApprovalData): void {
    if (!approvalData.annualInterestRate || approvalData.annualInterestRate < 0.1 || approvalData.annualInterestRate > 50) {
      throw new Error("Annual interest rate must be between 0.1% and 50%");
    }

    if (!approvalData.disbursementDate) {
      throw new Error("Disbursement date is required");
    }

    if (!approvalData.agreedMaturityDate) {
      throw new Error("Agreed maturity date is required");
    }

    const disbursementDate = new Date(approvalData.disbursementDate);
    const maturityDate = new Date(approvalData.agreedMaturityDate);

    if (disbursementDate >= maturityDate) {
      throw new Error("Maturity date must be after disbursement date");
    }

    if (!approvalData.repaymentFrequency) {
      throw new Error("Repayment frequency is required");
    }

    if (!approvalData.interestMethod) {
      throw new Error("Interest method is required");
    }

    if (approvalData.gracePeriodMonths && (approvalData.gracePeriodMonths < 0 || approvalData.gracePeriodMonths > 12)) {
      throw new Error("Grace period must be between 0 and 12 months");
    }
  }
  // NEW: Daily Interest Accrual Service
  async performDailyInterestAccrual(organizationId?: number): Promise<ServiceResponse<DailyCalculationResult>> {
    try {
      const queryBuilder = this.loanRepository
        .createQueryBuilder('loan')
        .where('loan.status IN (:...statuses)', {
          statuses: [LoanStatus.DISBURSED, LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL]
        });

      if (organizationId) {
        queryBuilder.andWhere('loan.organizationId = :organizationId', { organizationId });
      }

      const activeLoans = await queryBuilder.getMany();

      let totalLoansProcessed = 0;
      let totalInterestAccrued = 0;
      let loansWithUpdatedStatus = 0;
      const errors: string[] = [];

      for (const loan of activeLoans) {
        try {
          const updates = await this.calculateCurrentLoanBalances(loan.id);

          if (updates) {
            await this.loanRepository.update(loan.id, {
              outstandingPrincipal: updates.outstandingPrincipal,
              accruedInterestToDate: updates.accruedInterestToDate,
              daysInArrears: updates.daysInArrears,
              status: updates.status,
              updatedAt: new Date()
            });

            totalLoansProcessed++;
            totalInterestAccrued += updates.accruedInterestToDate - loan.accruedInterestToDate;

            if (updates.status !== loan.status) {
              loansWithUpdatedStatus++;
            }
          }
        } catch (loanError: any) {
          errors.push(`Loan ${loan.loanId}: ${loanError.message}`);
        }
      }

      return {
        success: true,
        message: `Daily interest accrual completed for ${totalLoansProcessed} loans`,
        data: {
          totalLoansProcessed,
          totalInterestAccrued,
          loansWithUpdatedStatus,
          errors
        }
      };

    } catch (error: any) {
      console.error("Daily interest accrual error:", error);
      return {
        success: false,
        message: "Failed to perform daily interest accrual",
        data: {
          totalLoansProcessed: 0,
          totalInterestAccrued: 0,
          loansWithUpdatedStatus: 0,
          errors: [error.message]
        }
      };
    }
  }
  async getOverdueLoans(organizationId: number, daysOverdue: number = 1): Promise<ServiceResponse> {
    try {
      const loans = await this.loanRepository.find({
        where: { organizationId },
        relations: ['borrower', 'repaymentSchedules']
      });

      // Use the same logic as schedule for consistency
      const overdueLoans = loans.filter(loan =>
        loan.daysInArrears >= daysOverdue &&
        loan.status !== LoanStatus.CLOSED
      );

      const overdueLoansWithBalances = overdueLoans.map(loan => ({
        ...loan,
        currentBalances: {
          outstandingPrincipal: loan.outstandingPrincipal,
          accruedInterestToDate: loan.accruedInterestToDate,
          daysInArrears: loan.daysInArrears,
          status: loan.status
        }
      }));

      const totalOverdueAmount = overdueLoansWithBalances.reduce((sum, loan) =>
        sum + (loan.outstandingPrincipal + loan.accruedInterestToDate), 0
      );

      return {
        success: true,
        message: `Retrieved ${overdueLoansWithBalances.length} overdue loans`,
        data: {
          overdueLoans: overdueLoansWithBalances,
          summary: {
            totalOverdueLoans: overdueLoansWithBalances.length,
            totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
            averageDaysInArrears: overdueLoansWithBalances.length > 0 ?
              overdueLoansWithBalances.reduce((sum, loan) => sum + loan.daysInArrears, 0) / overdueLoansWithBalances.length : 0,
            classificationBreakdown: {
              watch: overdueLoansWithBalances.filter(l => l.daysInArrears <= 90).length,
              substandard: overdueLoansWithBalances.filter(l => l.daysInArrears > 90 && l.daysInArrears <= 180).length,
              doubtful: overdueLoansWithBalances.filter(l => l.daysInArrears > 180 && l.daysInArrears <= 365).length,
              loss: overdueLoansWithBalances.filter(l => l.daysInArrears > 365).length
            }
          }
        }
      };

    } catch (error: any) {
      console.error("Get overdue loans error:", error);
      return {
        success: false,
        message: "Failed to retrieve overdue loans"
      };
    }
  }
  async calculateCurrentLoanBalances(loanId: number): Promise<{
    outstandingPrincipal: number;
    accruedInterestToDate: number;
    daysInArrears: number;
    status: LoanStatus;
  } | null> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId },
        relations: ['repaymentSchedules', 'transactions']
      });

      if (!loan) {
        throw new Error('Loan not found');
      }

      // FIXED: Validate all required fields exist
      if (!loan.disbursedAmount || !loan.disbursementDate ||
        !loan.annualInterestRate || !loan.termInMonths) {
        console.error('Missing required loan data:', {
          hasDisbursedAmount: !!loan.disbursedAmount,
          hasDisbursementDate: !!loan.disbursementDate,
          hasAnnualInterestRate: !!loan.annualInterestRate,
          hasTermInMonths: !!loan.termInMonths
        });
        return null;
      }

      // FIXED: Ensure disbursementDate is a proper Date object
      let disbursementDate: Date;
      if (loan.disbursementDate instanceof Date) {
        disbursementDate = loan.disbursementDate;
      } else if (typeof loan.disbursementDate === 'string') {
        disbursementDate = new Date(loan.disbursementDate);
      } else {
        console.error('Invalid disbursementDate format:', loan.disbursementDate);
        return null;
      }

      // Validate the date
      if (isNaN(disbursementDate.getTime())) {
        console.error('Invalid disbursementDate - cannot parse:', loan.disbursementDate);
        return null;
      }

      const disbursedAmount = Number(loan.disbursedAmount) || 0;
      const totalInterestAmount = Number(loan.totalInterestAmount) || 0;

      // Calculate total payments made
      const totalPrincipalPaid = (loan.transactions || []).reduce((sum, t) =>
        sum + (Number(t.principalPaid) || 0), 0);

      const totalInterestPaid = (loan.transactions || []).reduce((sum, t) =>
        sum + (Number(t.interestPaid) || 0), 0);

      // Calculate outstanding principal
      const outstandingPrincipal = Math.max(0, disbursedAmount - totalPrincipalPaid);

      // FIXED: Calculate days since disbursement with validation
      const today = new Date();
      const daysSinceDisbursement = Math.max(0, Math.floor(
        (today.getTime() - disbursementDate.getTime()) / (1000 * 60 * 60 * 24)
      ));

      // Calculate accrued interest
      let accruedInterestToDate: number;

      if (loan.interestMethod === InterestMethod.FLAT) {
        const daysInTerm = loan.termInMonths * 30;
        if (daysInTerm === 0) {
          console.error('Invalid term calculation');
          return null;
        }

        const dailyInterest = totalInterestAmount / daysInTerm;
        accruedInterestToDate = Math.min(
          dailyInterest * daysSinceDisbursement,
          totalInterestAmount
        ) - totalInterestPaid;
      } else {
        const dailyRate = loan.annualInterestRate / 100 / 365;
        accruedInterestToDate = (outstandingPrincipal * dailyRate * daysSinceDisbursement) - totalInterestPaid;
      }

      // Ensure non-negative and valid
      accruedInterestToDate = Math.max(0, Number(accruedInterestToDate) || 0);

      // Calculate days in arrears
      const overdueSchedules = (loan.repaymentSchedules || []).filter(schedule => {
        let scheduleDueDate: Date;
        if (schedule.dueDate instanceof Date) {
          scheduleDueDate = schedule.dueDate;
        } else if (typeof schedule.dueDate === 'string') {
          scheduleDueDate = new Date(schedule.dueDate);
        } else {
          return false;
        }

        return !isNaN(scheduleDueDate.getTime()) &&
          scheduleDueDate < today &&
          schedule.status !== ScheduleStatus.PAID;
      });

      let daysInArrears = 0;
      if (overdueSchedules.length > 0) {
        const validDueDates = overdueSchedules
          .map(schedule => {
            if (schedule.dueDate instanceof Date) {
              return schedule.dueDate.getTime();
            } else if (typeof schedule.dueDate === 'string') {
              const date = new Date(schedule.dueDate);
              return !isNaN(date.getTime()) ? date.getTime() : Infinity;
            }
            return Infinity;
          })
          .filter(time => time !== Infinity);

        if (validDueDates.length > 0) {
          const earliestOverdueDate = new Date(Math.min(...validDueDates));
          daysInArrears = Math.max(0, Math.floor(
            (today.getTime() - earliestOverdueDate.getTime()) / (1000 * 60 * 60 * 24)
          ));
        }
      }

      // Determine loan status based on days in arrears
      let status: LoanStatus;
      if (outstandingPrincipal <= 0) {
        status = LoanStatus.CLOSED;
      } else if (daysInArrears <= 30) {
        status = LoanStatus.PERFORMING;
      } else if (daysInArrears <= 90) {
        status = LoanStatus.WATCH;
      } else if (daysInArrears <= 180) {
        status = LoanStatus.SUBSTANDARD;
      } else if (daysInArrears <= 365) {
        status = LoanStatus.DOUBTFUL;
      } else {
        status = LoanStatus.LOSS;
      }

      const result = {
        outstandingPrincipal: Math.round(outstandingPrincipal * 100) / 100,
        accruedInterestToDate: Math.round(accruedInterestToDate * 100) / 100,
        daysInArrears,
        status
      };

      // Final validation
      if (isNaN(result.outstandingPrincipal) || isNaN(result.accruedInterestToDate)) {
        console.error('NaN detected in final result');
        return null;
      }

      return result;

    } catch (error: any) {
      console.error(`Calculate current balances error for loan ${loanId}:`, error);
      return null;
    }
  }

  // 6. FIXED: Enhanced generateRepaymentSchedule method
  generateRepaymentSchedule(loan: Loan): RepaymentSchedule[] {
    console.log('=== ENHANCED REPAYMENT SCHEDULE GENERATION START ===');

    const schedule: RepaymentSchedule[] = [];
    const principal = loan.disbursedAmount;
    const totalTerms = loan.totalNumberOfInstallments;
    let remainingPrincipal = principal;

    console.log('Schedule generation parameters:', {
      principal,
      totalTerms,
      frequency: loan.repaymentFrequency,
      firstPaymentDate: loan.agreedFirstPaymentDate,
      maturityDate: loan.agreedMaturityDate
    });

    // Calculate periodic rate for interest calculations
    const periodicRate = this.getPeriodicRate(
      loan.annualInterestRate,
      loan.repaymentFrequency
    );

    for (let i = 1; i <= totalTerms; i++) {
      // Calculate due date based on frequency (DYNAMIC)
      const dueDate = this.calculateInstallmentDueDate(
        loan.agreedFirstPaymentDate,
        i,
        loan.repaymentFrequency
      );

      let duePrincipal: number;
      let dueInterest: number;

      if (loan.interestMethod === InterestMethod.FLAT) {
        // For flat interest, principal is repaid equally
        duePrincipal = principal / totalTerms;

        // Interest is also equal for each period in flat method
        dueInterest = loan.totalInterestAmount / totalTerms;

        // Update remaining principal
        remainingPrincipal -= duePrincipal;
      } else {
        // Reducing balance method
        dueInterest = remainingPrincipal * periodicRate;
        duePrincipal = loan.monthlyInstallmentAmount - dueInterest;
        remainingPrincipal -= duePrincipal;
      }

      // Adjust last payment for rounding differences
      if (i === totalTerms) {
        const roundingAdjustment = remainingPrincipal;
        duePrincipal += roundingAdjustment;
        remainingPrincipal = 0;

        console.log(`Final installment adjustment: ${roundingAdjustment.toFixed(2)}`);
      }

      // Ensure remainingPrincipal is non-negative
      remainingPrincipal = Math.max(0, Math.round(remainingPrincipal * 100) / 100);

      const installment = new RepaymentSchedule();
      installment.loanId = loan.id;
      installment.installmentNumber = i;
      installment.dueDate = dueDate;
      installment.duePrincipal = Math.round(duePrincipal * 100) / 100;
      installment.dueInterest = Math.round(dueInterest * 100) / 100;
      installment.dueTotal = Math.round((duePrincipal + dueInterest) * 100) / 100;
      installment.outstandingPrincipal = remainingPrincipal;
      installment.status = ScheduleStatus.PENDING;
      installment.paidPrincipal = 0;
      installment.paidInterest = 0;
      installment.paidTotal = 0;
      installment.outstandingInterest = installment.dueInterest;
      installment.penaltyAmount = 0;
      installment.daysOverdue = 0;
      installment.isPaid = false;
      installment.paymentStatus = PaymentStatus.PENDING;

      schedule.push(installment);

      console.log(`Installment ${i}:`, {
        dueDate: dueDate.toISOString().split('T')[0],
        duePrincipal: installment.duePrincipal,
        dueInterest: installment.dueInterest,
        outstandingPrincipal: installment.outstandingPrincipal,
        dueTotal: installment.dueTotal
      });
    }

    console.log(`Generated ${schedule.length} repayment schedule entries`);
    console.log('=== ENHANCED REPAYMENT SCHEDULE GENERATION END ===');

    return schedule;
  }




  async getLoanWithCurrentBalances(loanId: number, organizationId: number): Promise<ServiceResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: [
          'borrower',
          'collaterals',
          'repaymentSchedules',
          'transactions',
          'classifications',
          'organization'
        ]
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan application not found"
        };
      }

      // Existing balance calculation code stays the same...
      let currentBalances: LoanCalculationUpdate | null = null;
      try {
        currentBalances = await this.calculateCurrentLoanBalances(loanId);
      } catch (balanceError: any) {
        console.error('Balance calculation failed, using stored values:', balanceError);
        currentBalances = {
          outstandingPrincipal: loan.outstandingPrincipal,
          accruedInterestToDate: loan.accruedInterestToDate,
          daysInArrears: loan.daysInArrears,
          status: loan.status
        };
      }

      const performanceMetrics = loan.getPerformanceMetrics();

      const enhancedLoan = {
        ...loan,
        currentBalances: currentBalances || {
          outstandingPrincipal: loan.outstandingPrincipal,
          accruedInterestToDate: loan.accruedInterestToDate,
          daysInArrears: loan.daysInArrears,
          status: loan.status
        },
        performanceMetrics,
        calculatedFields: {
          totalPaidAmount: loan.totalPaidAmount,
          totalPrincipalPaid: loan.totalPrincipalPaid,
          totalInterestPaid: loan.totalInterestPaid,
          remainingBalance: currentBalances ?
            currentBalances.outstandingPrincipal + currentBalances.accruedInterestToDate :
            loan.remainingBalance,
          loanToValueRatio: loan.loanToValueRatio,
          classificationCategory: loan.getClassificationCategory(),
          provisioningRate: loan.getProvisioningRate(),
          provisionRequired: loan.calculateProvisionRequired()
        }
      };

      return {
        success: true,
        message: "Loan application with current balances retrieved successfully",
        data: enhancedLoan
      };

    } catch (error: any) {
      console.error("Get loan with current balances error:", error);
      return {
        success: false,
        message: "Failed to retrieve loan application with current balances"
      };
    }
  }

  // ENHANCED: Update existing method to auto-regenerate schedule when loan terms change
  async updateLoanApplication(
    loanId: number,
    updateData: any,
    organizationId: number,
    updatedBy: number | null = null,
    files?: CollateralFiles
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Find existing loan application
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'collaterals', 'repaymentSchedules']
      });

      if (!loan) {
        throw new Error("Loan application not found");
      }

      // Update borrower data if provided
      if (updateData.firstName || updateData.lastName || updateData.email) {
        const borrowerUpdateData: any = {};

        const borrowerFields = [
          'firstName', 'lastName', 'middleName', 'nationalId', 'gender',
          'dateOfBirth', 'placeOfBirth', 'maritalStatus', 'primaryPhone', 'alternativePhone',
          'email', 'address', 'occupation', 'monthlyIncome', 'incomeSource',
          'relationshipWithNDFSP', 'previousLoansPaidOnTime'
        ];

        borrowerFields.forEach(field => {
          if (updateData[field] !== undefined) {
            borrowerUpdateData[field] = updateData[field];
          }
        });

        if (Object.keys(borrowerUpdateData).length > 0) {
          borrowerUpdateData.updatedBy = updatedBy;
          await queryRunner.manager.update(BorrowerProfile, loan.borrower.id, borrowerUpdateData);
        }
      }

      // Update loan data if provided
      const loanUpdateData: any = {};
      const loanFields = [
        'purposeOfLoan', 'branchName', 'loanOfficer', 'disbursedAmount',
        'disbursementDate', 'annualInterestRate', 'interestMethod',
        'termInMonths', 'repaymentFrequency', 'gracePeriodMonths', 'notes'
      ];

      loanFields.forEach(field => {
        if (updateData[field] !== undefined) {
          loanUpdateData[field] = updateData[field];
        }
      });

      // ENHANCED: Check if key loan parameters changed that require schedule regeneration
      const scheduleRegenerationRequired = Boolean(
        loanUpdateData.disbursedAmount || loanUpdateData.annualInterestRate ||
        loanUpdateData.termInMonths || loanUpdateData.interestMethod ||
        loanUpdateData.repaymentFrequency || loanUpdateData.gracePeriodMonths !== undefined
      );

      // Recalculate loan terms if key parameters changed
      if (scheduleRegenerationRequired) {
        // FIXED: Pass disbursement date for correct calculations
        const disbursementDate = loanUpdateData.disbursementDate ?
          new Date(loanUpdateData.disbursementDate) : loan.disbursementDate;

        const newTerms = this.calculateLoanTerms(
          loanUpdateData.disbursedAmount || loan.disbursedAmount,
          loanUpdateData.annualInterestRate || loan.annualInterestRate,
          loanUpdateData.termInMonths || loan.termInMonths,
          loanUpdateData.interestMethod || loan.interestMethod,
          loanUpdateData.repaymentFrequency || loan.repaymentFrequency,
          loanUpdateData.gracePeriodMonths !== undefined ? loanUpdateData.gracePeriodMonths : loan.gracePeriodMonths,
          disbursementDate // FIXED: Pass disbursement date
        );

        Object.assign(loanUpdateData, newTerms);

        // Delete existing repayment schedules if no payments have been made
        if (loan.repaymentSchedules && loan.repaymentSchedules.length > 0) {
          const hasPayments = loan.repaymentSchedules.some(schedule =>
            schedule.paidTotal > 0 || schedule.status === ScheduleStatus.PAID
          );

          if (!hasPayments) {
            await queryRunner.manager.delete(RepaymentSchedule,
              loan.repaymentSchedules.map(schedule => schedule.id)
            );
          } else {
            throw new Error("Cannot modify loan terms after payments have been made. Please create a loan restructuring instead.");
          }
        }
      }

      if (Object.keys(loanUpdateData).length > 0) {
        loanUpdateData.updatedBy = updatedBy;
        await queryRunner.manager.update(Loan, loanId, loanUpdateData);
      }

      // ENHANCED: Auto-regenerate repayment schedule if terms changed
      if (scheduleRegenerationRequired) {
        const updatedLoanForSchedule = await queryRunner.manager.findOne(Loan, {
          where: { id: loanId }
        });

        if (updatedLoanForSchedule) {
          const newRepaymentSchedule = this.generateRepaymentSchedule(updatedLoanForSchedule);
          await queryRunner.manager.save(RepaymentSchedule, newRepaymentSchedule);
        }
      }

      // Update collateral data and files if provided
      if (loan.collaterals && loan.collaterals.length > 0) {
        const collateralId = loan.collaterals[0].id;
        const collateralUpdateData: any = {};

        const collateralFields = [
          'collateralType', 'upiNumber', 'description', 'collateralValue', 'guarantorName',
          'guarantorPhone', 'guarantorAddress', 'valuationDate', 'valuedBy', 'notes'
        ];

        collateralFields.forEach(field => {
          if (updateData[field] !== undefined) {
            collateralUpdateData[field] = updateData[field];
          }
        });

        // Upload new files if provided
        if (files) {
          const uploadPromises: Promise<any>[] = [];
          const uploadedUrls: { [key: string]: string } = {};

          Object.entries(files).forEach(([fieldName, file]) => {
            if (file) {
              uploadPromises.push(
                UploadToCloud(file)
                  .then((result) => {
                    uploadedUrls[fieldName] = result.secure_url;
                  })
                  .catch((error) => {
                    console.error(`Failed to upload ${fieldName}:`, error);
                    throw new Error(`Failed to upload ${fieldName}: ${error.message}`);
                  })
              );
            }
          });

          if (uploadPromises.length > 0) {
            await Promise.all(uploadPromises);
            Object.assign(collateralUpdateData, uploadedUrls);
          }
        }

        if (Object.keys(collateralUpdateData).length > 0) {
          await queryRunner.manager.update(LoanCollateral, collateralId, collateralUpdateData);
        }
      }

      await queryRunner.commitTransaction();

      // Load updated loan application
      const updatedLoanApplication = await this.loanRepository.findOne({
        where: { id: loanId },
        relations: [
          'borrower',
          'collaterals',
          'repaymentSchedules',
          'organization'
        ]
      });

      return {
        success: true,
        message: scheduleRegenerationRequired ?
          "Loan application updated successfully with regenerated repayment schedule" :
          "Loan application updated successfully",
        data: updatedLoanApplication
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Update loan application error:", error);

      return {
        success: false,
        message: error.message || "Failed to update loan application"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // NEW: Batch update loan balances for organization
  async updateOrganizationLoanBalances(organizationId: number): Promise<ServiceResponse<DailyCalculationResult>> {
    return this.performDailyInterestAccrual(organizationId);
  }

  // In your LoanApplicationService.ts - Enhance the service methods:

  async getPortfolioSummary(organizationId: number): Promise<ServiceResponse> {
    try {
      console.log('=== GET PORTFOLIO SUMMARY DEBUG START ===');

      const loans = await this.loanRepository.find({
        where: { organizationId },
        relations: ['transactions', 'repaymentSchedules']
      });

      console.log('Total loans found:', loans.length);

      let totalDisbursed = 0;
      let totalOutstandingPrincipal = 0;
      let totalAccruedInterest = 0;
      let totalInArrears = 0;
      const statusBreakdown: Record<string, number> = {};

      // Calculate totals
      for (const loan of loans) {
        const disbursedAmount = Number(loan.disbursedAmount) || 0;
        totalDisbursed += disbursedAmount;

        const outstandingPrincipal = Number(loan.outstandingPrincipal) || 0;
        const accruedInterest = Number(loan.accruedInterestToDate) || 0;

        totalOutstandingPrincipal += outstandingPrincipal;
        totalAccruedInterest += accruedInterest;

        if (loan.daysInArrears > 0) {
          totalInArrears += (outstandingPrincipal + accruedInterest);
        }

        // Count all statuses
        statusBreakdown[loan.status] = (statusBreakdown[loan.status] || 0) + 1;
      }

      const portfolioAtRisk = totalDisbursed > 0 ? (totalInArrears / totalDisbursed) * 100 : 0;
      const averageLoanAmount = loans.length > 0 ? totalDisbursed / loans.length : 0;

      // Calculate average interest rate from active loans
      const activeLoans = loans.filter(loan =>
        [LoanStatus.DISBURSED, LoanStatus.PERFORMING, LoanStatus.WATCH].includes(loan.status)
      );
      const averageInterestRate = activeLoans.length > 0
        ? activeLoans.reduce((sum, loan) => sum + Number(loan.annualInterestRate), 0) / activeLoans.length
        : 0;

      const summaryData = {
        totalLoans: loans.length,
        totalDisbursed: Math.round(totalDisbursed * 100) / 100,
        totalOutstandingPrincipal: Math.round(totalOutstandingPrincipal * 100) / 100,
        totalAccruedInterest: Math.round(totalAccruedInterest * 100) / 100,
        totalInArrears: Math.round(totalInArrears * 100) / 100,
        portfolioAtRisk: Math.round(portfolioAtRisk * 100) / 100,
        averageLoanAmount: Math.round(averageLoanAmount * 100) / 100,
        statusBreakdown,
        performingLoans: statusBreakdown[LoanStatus.PERFORMING] || 0,
        nonPerformingLoans: loans.length - (statusBreakdown[LoanStatus.PERFORMING] || 0),
        averageInterestRate: Math.round(averageInterestRate * 100) / 100,
        calculationTimestamp: new Date()
      };

      console.log('Portfolio summary calculated:', summaryData);

      return {
        success: true,
        message: "Portfolio summary retrieved successfully",
        data: summaryData
      };

    } catch (error: any) {
      console.error("Portfolio summary error:", error);
      return {
        success: false,
        message: "Failed to retrieve portfolio summary"
      };
    }
  }
  async getLoanApplications(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    statusFilter?: string
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      // ✅ ENHANCED: Build query with DISBURSED and PERFORMING status filter
      const queryBuilder = this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.collaterals', 'collaterals')
        .leftJoinAndSelect('loan.organization', 'organization')
        .leftJoinAndSelect('loan.repaymentSchedules', 'repaymentSchedules')
        .leftJoinAndSelect('loan.transactions', 'transactions')
        .leftJoinAndSelect('loan.reviews', 'reviews')
        .leftJoinAndSelect('reviews.reviewer', 'reviewer')
        .leftJoinAndSelect('loan.guarantors', 'guarantors')
        .leftJoinAndSelect('guarantors.collateral', 'guarantorCollateral')
        .where('loan.organizationId = :organizationId', { organizationId })
        // ✅ ENHANCED: Show BOTH disbursed AND performing loans
        .andWhere('loan.status IN (:...allowedStatuses)', {
          allowedStatuses: [LoanStatus.DISBURSED, LoanStatus.PERFORMING]
        });

      // ✅ PRESERVED: Original search functionality
      if (search) {
        queryBuilder.andWhere(
          '(loan.loanId ILIKE :search OR loan.purposeOfLoan ILIKE :search OR ' +
          'borrower.firstName ILIKE :search OR borrower.lastName ILIKE :search OR ' +
          'borrower.nationalId ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      // ✅ ENHANCED: Additional status filtering within allowed statuses
      if (statusFilter && statusFilter !== 'all') {
        // Allow filtering between disbursed and performing if needed
        if (statusFilter === LoanStatus.DISBURSED || statusFilter === LoanStatus.PERFORMING) {
          queryBuilder.andWhere('loan.status = :specificStatus', {
            specificStatus: statusFilter
          });
        }
      }

      // ✅ PRESERVED: Original ordering
      queryBuilder
        .orderBy('loan.disbursementDate', 'DESC', 'NULLS LAST')
        .addOrderBy('loan.createdAt', 'DESC');

      // ✅ Execute query with pagination
      const [loans, totalItems] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      // ✅ PRESERVED: Enhanced loan data with all original calculations
      const enhancedLoans = loans.map(loan => {
        // Calculate payment progress
        const paymentProgress = this.calculatePaymentProgress(loan);

        // Get next payment info
        const nextPaymentInfo = this.getNextPaymentInfo(loan);

        // Get guarantor information
        const guarantorInformation = loan.guarantors && loan.guarantors.length > 0
          ? loan.guarantors
            .filter(g => g.isActive)
            .map(guarantor => ({
              id: guarantor.id,
              name: guarantor.name,
              phone: guarantor.phone,
              email: guarantor.email,
              guaranteedAmount: guarantor.guaranteedAmount,
              guarantorType: guarantor.guarantorType,
              isValidGuarantor: guarantor.isValidGuarantor()
            }))
          : [];

        const guarantorSummary = {
          totalGuarantors: guarantorInformation.length,
          totalGuaranteedAmount: guarantorInformation.reduce(
            (sum, g) => sum + (g.guaranteedAmount || 0),
            0
          )
        };

        return {
          ...loan,
          // ✅ PRESERVED: All original calculated fields
          paymentProgress,
          nextPaymentInfo,
          guarantorInformation,
          guarantorSummary,
          // Financial summary
          financialSummary: {
            disbursedAmount: loan.disbursedAmount,
            outstandingPrincipal: loan.outstandingPrincipal,
            accruedInterest: loan.accruedInterestToDate,
            totalPaid: paymentProgress.totalPaid,
            remainingBalance: paymentProgress.remainingBalance
          },
          // Performance metrics
          paymentCompletionRate: paymentProgress.completionRate,
          principalRecoveryRate: paymentProgress.recoveryRate,
          // Collateral info
          collateralCoverage: loan.getCollateralCoverageRatio?.() || 0,
          totalCollateralValue: loan.totalCollateralValue || 0,
          // Status info
          daysInArrears: loan.daysInArrears,
          isOverdue: loan.daysInArrears > 0,
          classificationCategory: loan.getClassificationCategory?.() || 'Unknown',
          // ✅ NEW: Status indicator for filtering/display
          statusCategory: loan.status === LoanStatus.PERFORMING ? 'performing' : 'disbursed'
        };
      });

      // ✅ PRESERVED: Portfolio summary calculation
      const portfolioSummary = this.calculatePortfolioSummaryFromLoans(enhancedLoans);

      // ✅ ENHANCED: Count breakdown by status
      const statusBreakdown = {
        disbursed: enhancedLoans.filter(l => l.status === LoanStatus.DISBURSED).length,
        performing: enhancedLoans.filter(l => l.status === LoanStatus.PERFORMING).length,
        total: enhancedLoans.length
      };

      return {
        success: true,
        message: `Retrieved ${totalItems} active loan(s) successfully`,
        data: {
          loans: enhancedLoans,
          portfolioSummary,
          statusBreakdown, // ✅ NEW: Status counts
          statusFilter: statusFilter || 'all',
          appliedFilters: {
            allowedStatuses: [LoanStatus.DISBURSED, LoanStatus.PERFORMING],
            specificStatus: statusFilter && statusFilter !== 'all' ? statusFilter : null,
            search: search || null
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
      console.error("Get loan applications error:", error);
      return {
        success: false,
        message: "Failed to retrieve loan applications",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  private calculatePaymentProgress(loan: Loan): {
    paidInstallments: number;
    remainingInstallments: number;
    pendingInstallments: number;
    overdueInstallments: number;
    completionRate: number;
    recoveryRate: number;
    totalPaid: number;
    remainingBalance: number;
  } {
    const schedules = loan.repaymentSchedules || [];
    const transactions = loan.transactions || [];

    // Count installments by status
    const paidInstallments = schedules.filter(s =>
      s.isPaid || s.paymentStatus === PaymentStatus.PAID
    ).length;

    const today = new Date();
    const overdueInstallments = schedules.filter(s =>
      !s.isPaid &&
      new Date(s.dueDate) < today
    ).length;

    const pendingInstallments = schedules.filter(s =>
      !s.isPaid &&
      new Date(s.dueDate) >= today
    ).length;

    const totalInstallments = loan.totalNumberOfInstallments || schedules.length;
    const remainingInstallments = totalInstallments - paidInstallments;

    // Calculate completion rate
    const completionRate = totalInstallments > 0
      ? Math.round((paidInstallments / totalInstallments) * 100 * 100) / 100
      : 0;

    // Calculate total paid
    const totalPaid = transactions
      .filter(t => t.isActive)
      .reduce((sum, t) => sum + (Number(t.amountPaid) || 0), 0);

    // Calculate principal recovery rate
    const disbursedAmount = Number(loan.disbursedAmount) || 0;
    const totalPrincipalPaid = transactions
      .filter(t => t.isActive)
      .reduce((sum, t) => sum + (Number(t.principalPaid) || 0), 0);

    const recoveryRate = disbursedAmount > 0
      ? Math.round((totalPrincipalPaid / disbursedAmount) * 100 * 100) / 100
      : 0;

    // Calculate remaining balance
    const outstandingPrincipal = Number(loan.outstandingPrincipal) || 0;
    const accruedInterest = Number(loan.accruedInterestToDate) || 0;
    const remainingBalance = Math.round((outstandingPrincipal + accruedInterest) * 100) / 100;

    return {
      paidInstallments,
      remainingInstallments: Math.max(0, remainingInstallments),
      pendingInstallments,
      overdueInstallments,
      completionRate,
      recoveryRate,
      totalPaid: Math.round(totalPaid * 100) / 100,
      remainingBalance
    };
  }



  private calculatePortfolioSummaryFromLoans(loans: any[]): {
    totalLoans: number;
    totalDisbursed: number;
    totalOutstanding: number;
    totalPaid: number;
    averageCompletionRate: number;
    byFrequency: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    let totalDisbursed = 0;
    let totalOutstanding = 0;
    let totalPaid = 0;
    let totalCompletionRate = 0;

    const byFrequency: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    loans.forEach(loan => {
      // Sum amounts
      totalDisbursed += Number(loan.disbursedAmount) || 0;
      totalOutstanding += Number(loan.outstandingPrincipal) || 0;
      totalPaid += loan.financialSummary?.totalPaid || 0;
      totalCompletionRate += loan.paymentCompletionRate || 0;

      // Count by frequency
      const freq = loan.repaymentFrequency;
      byFrequency[freq] = (byFrequency[freq] || 0) + 1;

      // Count by status
      const status = loan.status;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    return {
      totalLoans: loans.length,
      totalDisbursed: Math.round(totalDisbursed * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      averageCompletionRate: loans.length > 0
        ? Math.round((totalCompletionRate / loans.length) * 100) / 100
        : 0,
      byFrequency,
      byStatus
    };
  }


  private getPeriodicPaymentLabel(frequency: RepaymentFrequency): string {
    const labels: Record<RepaymentFrequency, string> = {
      [RepaymentFrequency.DAILY]: "Daily Payment",
      [RepaymentFrequency.WEEKLY]: "Weekly Payment",
      [RepaymentFrequency.BIWEEKLY]: "Bi-Weekly Payment",
      [RepaymentFrequency.MONTHLY]: "Monthly Payment",
      [RepaymentFrequency.QUARTERLY]: "Quarterly Payment",
      [RepaymentFrequency.SEMI_ANNUALLY]: "Semi-Annual Payment",
      [RepaymentFrequency.ANNUALLY]: "Annual Payment"
    };

    return labels[frequency] || "Periodic Payment";
  }

  /**
   * Get next payment information
   */
  private getNextPaymentInfo(loan: Loan): {
    nextPaymentDate: Date | null;
    nextPaymentAmount: number;
  } {
    if (!loan.repaymentSchedules || loan.repaymentSchedules.length === 0) {
      return {
        nextPaymentDate: null,
        nextPaymentAmount: 0
      };
    }

    // Find the next unpaid schedule
    const nextSchedule = loan.repaymentSchedules
      .filter(schedule =>
        !schedule.isPaid &&
        schedule.paymentStatus !== PaymentStatus.PAID
      )
      .sort((a, b) => {
        const dateA = new Date(a.dueDate);
        const dateB = new Date(b.dueDate);
        return dateA.getTime() - dateB.getTime();
      })[0];

    if (!nextSchedule) {
      return {
        nextPaymentDate: null,
        nextPaymentAmount: 0
      };
    }

    return {
      nextPaymentDate: new Date(nextSchedule.dueDate),
      nextPaymentAmount: Math.round((Number(nextSchedule.dueTotal) - Number(nextSchedule.paidTotal)) * 100) / 100
    };
  }
  async getLoanApplicationById(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    // Use the enhanced version that includes current balances
    return this.getLoanWithCurrentBalances(loanId, organizationId);
  }

  async deleteLoanApplication(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Find loan with all related data
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'collaterals', 'repaymentSchedules', 'transactions']
      });

      if (!loan) {
        throw new Error("Loan application not found");
      }

      // Check if loan can be deleted (no payments made)
      if (loan.transactions && loan.transactions.length > 0) {
        throw new Error("Cannot delete loan application with existing payments");
      }

      // Delete in correct order (foreign key constraints)
      if (loan.repaymentSchedules && loan.repaymentSchedules.length > 0) {
        await queryRunner.manager.delete(RepaymentSchedule,
          loan.repaymentSchedules.map(schedule => schedule.id)
        );
      }

      if (loan.collaterals && loan.collaterals.length > 0) {
        await queryRunner.manager.delete(LoanCollateral,
          loan.collaterals.map(collateral => collateral.id)
        );
      }

      await queryRunner.manager.delete(Loan, loanId);
      await queryRunner.manager.delete(BorrowerProfile, loan.borrower.id);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Loan application deleted successfully"
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Delete loan application error:", error);

      return {
        success: false,
        message: error.message || "Failed to delete loan application"
      };
    } finally {
      await queryRunner.release();
    }
  }

  async getLoanApplicationStats(organizationId: number): Promise<ServiceResponse> {
    try {
      // Get all applications without status filtering
      const totalApplications = await this.loanRepository.count({
        where: { organizationId }
      });

      const loans = await this.loanRepository.find({
        where: { organizationId },
        relations: ['transactions']
      });

      // Calculate totals using the same approach as schedule
      const totalDisbursed = loans.reduce((sum, loan) =>
        sum + (Number(loan.disbursedAmount) || 0), 0);

      const totalOutstanding = loans.reduce((sum, loan) =>
        sum + (Number(loan.outstandingPrincipal) || 0) + (Number(loan.accruedInterestToDate) || 0), 0);

      const statusCounts = await this.loanRepository
        .createQueryBuilder('loan')
        .select('loan.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('loan.organizationId = :organizationId', { organizationId })
        .groupBy('loan.status')
        .getRawMany();

      const statusBreakdown = statusCounts.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>);

      return {
        success: true,
        message: "Loan application statistics retrieved successfully",
        data: {
          totalApplications,
          statusBreakdown,
          totalDisbursed: Math.round(totalDisbursed * 100) / 100,
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
          averageLoanAmount: totalApplications > 0 ? Math.round(totalDisbursed / totalApplications * 100) / 100 : 0,
          activeLoansCount: loans.filter(loan =>
            [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL].includes(loan.status)
          ).length,
          portfolioHealthMetrics: {
            performingLoansRatio: totalApplications > 0 ?
              (statusBreakdown[LoanStatus.PERFORMING] || 0) / totalApplications * 100 : 0,
            watchLoansRatio: totalApplications > 0 ?
              (statusBreakdown[LoanStatus.WATCH] || 0) / totalApplications * 100 : 0,
            npmRatio: totalDisbursed > 0 ?
              (totalOutstanding / totalDisbursed) * 100 : 0
          },
          lastCalculated: new Date()
        }
      };

    } catch (error: any) {
      console.error("Get loan application stats error:", error);
      return {
        success: false,
        message: "Failed to retrieve loan application statistics"
      };
    }
  }

  private getValidStatusTransitions(currentStatus: LoanStatus): LoanStatus[] {
    const transitions: Record<LoanStatus, LoanStatus[]> = {
      [LoanStatus.PENDING]: [
        LoanStatus.APPROVED,
        LoanStatus.DISBURSED
      ],
      [LoanStatus.APPROVED]: [
        LoanStatus.DISBURSED,
        LoanStatus.PENDING
      ],
      [LoanStatus.DISBURSED]: [
        LoanStatus.PERFORMING,
        LoanStatus.WATCH,
        LoanStatus.CLOSED
      ],
      [LoanStatus.PERFORMING]: [
        LoanStatus.WATCH,
        LoanStatus.SUBSTANDARD,
        LoanStatus.CLOSED
      ],
      [LoanStatus.WATCH]: [
        LoanStatus.PERFORMING,
        LoanStatus.SUBSTANDARD,
        LoanStatus.DOUBTFUL
      ],
      [LoanStatus.SUBSTANDARD]: [
        LoanStatus.WATCH,
        LoanStatus.DOUBTFUL,
        LoanStatus.LOSS
      ],
      [LoanStatus.DOUBTFUL]: [
        LoanStatus.SUBSTANDARD,
        LoanStatus.LOSS,
        LoanStatus.WRITTEN_OFF
      ],
      [LoanStatus.LOSS]: [
        LoanStatus.WRITTEN_OFF,
        LoanStatus.DOUBTFUL
      ],
      [LoanStatus.WRITTEN_OFF]: [
        // Usually terminal status, but might allow recovery
      ],
      [LoanStatus.CLOSED]: [
        // Terminal status - loan is fully paid
      ]
    };

    return transitions[currentStatus] || [];
  }
  async changeLoanStatus(
    loanId: number,
    newStatus: LoanStatus,
    organizationId: number,
    updatedBy: number | null = null,
    notes: string = '',
    notificationData?: {
      sendEmail?: boolean;
      customMessage?: string;
      dueDate?: string;
    }
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      console.log('=== CHANGE LOAN STATUS DEBUG START ===');
      console.log('Parameters:', {
        loanId,
        newStatus,
        organizationId,
        updatedBy,
        notes,
        notificationData
      });

      // Find the loan with borrower information
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'organization', 'repaymentSchedules']
      });

      if (!loan) {
        await queryRunner.rollbackTransaction();
        return {
          success: false,
          message: "Loan not found or you don't have permission to access it"
        };
      }

      // Validate status transition
      const validStatusTransitions = this.getValidStatusTransitions(loan.status);
      if (!validStatusTransitions.includes(newStatus)) {
        await queryRunner.rollbackTransaction();
        return {
          success: false,
          message: `Invalid status transition from ${loan.status} to ${newStatus}. Valid transitions: ${validStatusTransitions.join(', ')}`
        };
      }

      console.log('Loan found:', {
        currentStatus: loan.status,
        newStatus,
        borrowerEmail: loan.borrower.email,
        borrowerName: loan.borrower.fullName
      });

      // Store previous status for email notification
      const previousStatus = loan.status;

      // Update loan status
      const updateData: any = {
        status: newStatus,
        updatedBy,
        updatedAt: new Date()
      };

      // Add status-specific updates
      if (newStatus === LoanStatus.DISBURSED) {
        updateData.disbursementDate = new Date();
      } else if (newStatus === LoanStatus.CLOSED) {
        updateData.outstandingPrincipal = 0;
        updateData.accruedInterestToDate = 0;
        updateData.daysInArrears = 0;
      }

      // Add notes if provided
      if (notes) {
        updateData.notes = loan.notes
          ? `${loan.notes}\n\n[${new Date().toISOString()}] Status changed to ${newStatus}: ${notes}`
          : notes;
      }

      await queryRunner.manager.update(Loan, loanId, updateData);

      // Create status change log entry (optional audit trail)
      try {
        console.log('Status change logged:', {
          loanId,
          fromStatus: previousStatus,
          toStatus: newStatus,
          changedBy: updatedBy,
          timestamp: new Date()
        });
      } catch (logError) {
        console.warn('Failed to log status change:', logError);
        // Don't fail the transaction for logging errors
      }

      // Calculate current balances for email notification
      let currentBalances: LoanCalculationUpdate | null = null;
      try {
        currentBalances = await this.calculateCurrentLoanBalances(loanId);
      } catch (balanceError) {
        console.warn('Failed to calculate current balances:', balanceError);
      }

      await queryRunner.commitTransaction();

      // Send email notification if borrower has email and notification is enabled
      let emailSent = false;
      let emailError: string | null = null;

      if (
        loan.borrower.email &&
        (notificationData?.sendEmail !== false) // Default to true unless explicitly false
      ) {
        try {
          const nextDueDate = this.getNextDueDate(loan.repaymentSchedules || []);

          await sendLoanStatusUpdateEmail(
            loan.borrower.email,
            loan.borrower.fullName,
            loan.loanId,
            newStatus,
            previousStatus,
            loan.disbursedAmount,
            currentBalances?.outstandingPrincipal || loan.outstandingPrincipal,
            notificationData?.dueDate || nextDueDate,
            notificationData?.customMessage || notes
          );

          emailSent = true;
          console.log(`Status change notification sent to ${loan.borrower.email}`);
        } catch (error: any) {
          emailError = error.message;
          console.error('Failed to send status change notification:', error);
          // Don't fail the entire operation if email fails
        }
      }

      // === fetch updated loan with all relations ===
      const updatedLoan = await this.loanRepository.findOne({
        where: { id: loanId },
        relations: [
          'borrower',
          'organization',
          'collaterals',
          'repaymentSchedules',
          'transactions'
        ]
      });

      console.log('=== CHANGE LOAN STATUS DEBUG END ===');

      // Final response
      return {
        success: true,
        message: `Loan status successfully changed from ${previousStatus} to ${newStatus}${emailSent ? ' and notification sent to borrower' : ''
          }`,
        data: {
          loan: updatedLoan,
          statusChange: {
            previousStatus,
            newStatus,
            changedAt: new Date(),
            changedBy: updatedBy,
            notes
          },
          notification: {
            emailSent,
            emailError,
            borrowerEmail: loan.borrower.email,
            notificationEnabled: notificationData?.sendEmail !== false
          },
          currentBalances: currentBalances || {
            outstandingPrincipal: updatedLoan?.outstandingPrincipal || 0,
            accruedInterestToDate: updatedLoan?.accruedInterestToDate || 0,
            daysInArrears: updatedLoan?.daysInArrears || 0,
            status: newStatus
          }
        }
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Change loan status error:', error);

      return {
        success: false,
        message: error.message || 'Failed to change loan status',
        data: {
          error:
            process.env.NODE_ENV === 'development'
              ? {
                name: error.name,
                message: error.message,
                stack: error.stack
              }
              : undefined
        }
      };
    } finally {
      await queryRunner.release();
    }
  }

  private getNextDueDate(repaymentSchedules: RepaymentSchedule[]): string {
    if (!repaymentSchedules || repaymentSchedules.length === 0) {
      return '';
    }

    const today = new Date();
    const nextSchedule = repaymentSchedules
      .filter(schedule => schedule.dueDate > today && schedule.status !== ScheduleStatus.PAID)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

    if (!nextSchedule) {
      return '';
    }

    return nextSchedule.dueDate.toLocaleDateString('en-RW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  async bulkChangeLoanStatus(
    loanIds: number[],
    newStatus: LoanStatus,
    organizationId: number,
    updatedBy: number | null = null,
    notes: string = '',
    notificationData?: {
      sendEmail?: boolean;
      customMessage?: string;
    }
  ): Promise<ServiceResponse> {
    try {
      console.log('=== BULK CHANGE LOAN STATUS DEBUG START ===');
      console.log('Parameters:', {
        loanIds,
        newStatus,
        organizationId,
        updatedBy,
        notes,
        notificationData
      });

      if (!loanIds || loanIds.length === 0) {
        return {
          success: false,
          message: 'No loan IDs provided'
        };
      }

      if (loanIds.length > 50) {
        return {
          success: false,
          message: 'Cannot process more than 50 loans at once'
        };
      }

      const results: any[] = [];
      const errors: any[] = [];
      let successCount = 0;
      let emailsSent = 0;

      for (const loanId of loanIds) {
        try {
          const result = await this.changeLoanStatus(
            loanId,
            newStatus,
            organizationId,
            updatedBy,
            notes,
            notificationData
          );

          if (result.success) {
            successCount++;
            if (result.data?.notification?.emailSent) {
              emailsSent++;
            }
            results.push({
              loanId,
              success: true,
              message: result.message,
              emailSent: result.data?.notification?.emailSent || false
            });
          } else {
            errors.push({
              loanId,
              error: result.message
            });
            results.push({
              loanId,
              success: false,
              message: result.message,
              emailSent: false
            });
          }
        } catch (error: any) {
          errors.push({
            loanId,
            error: error.message
          });
          results.push({
            loanId,
            success: false,
            message: error.message,
            emailSent: false
          });
        }
      }

      console.log('Bulk status change completed:', {
        totalLoans: loanIds.length,
        successCount,
        errorCount: errors.length,
        emailsSent
      });
      console.log('=== BULK CHANGE LOAN STATUS DEBUG END ===');

      return {
        success: successCount > 0,
        message: `Bulk status change completed: ${successCount} successful, ${errors.length} failed, ${emailsSent} notifications sent`,
        data: {
          summary: {
            totalLoans: loanIds.length,
            successfulChanges: successCount,
            failedChanges: errors.length,
            emailNotificationsSent: emailsSent,
            newStatus
          },
          results,
          errors: errors.length > 0 ? errors : undefined
        }
      };
    } catch (error: any) {
      console.error('Bulk change loan status error:', error);

      return {
        success: false,
        message: 'Failed to perform bulk status change',
        data: {
          error:
            process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      };
    }
  }
  async getLoansEligibleForStatusChange(
    organizationId: number,
    currentStatus?: LoanStatus
  ): Promise<ServiceResponse> {
    try {
      const queryBuilder = this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.repaymentSchedules', 'schedules')
        .where('loan.organizationId = :organizationId', { organizationId });

      if (currentStatus) {
        queryBuilder.andWhere('loan.status = :currentStatus', { currentStatus });
      }

      // Exclude terminal statuses
      queryBuilder.andWhere('loan.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: [LoanStatus.CLOSED, LoanStatus.WRITTEN_OFF]
      });

      const loans = await queryBuilder
        .orderBy('loan.daysInArrears', 'DESC')
        .addOrderBy('loan.createdAt', 'ASC')
        .getMany();

      // Add suggested status for each loan based on current conditions
      const loansWithSuggestions = await Promise.all(
        loans.map(async (loan) => {
          const currentBalances = await this.calculateCurrentLoanBalances(loan.id);
          const suggestedStatus = this.getSuggestedStatus(loan, currentBalances);
          const validTransitions = this.getValidStatusTransitions(loan.status);

          return {
            ...loan,
            currentBalances,
            suggestedStatus,
            validTransitions,
            eligibleForChange: validTransitions.length > 0
          };
        })
      );

      return {
        success: true,
        message: `Found ${loansWithSuggestions.length} loans eligible for status change`,
        data: {
          loans: loansWithSuggestions,
          summary: {
            totalEligible: loansWithSuggestions.length,
            byCurrentStatus: loansWithSuggestions.reduce((acc, loan) => {
              acc[loan.status] = (acc[loan.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          }
        }
      };

    } catch (error: any) {
      console.error("Get loans eligible for status change error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve loans eligible for status change"
      };
    }
  }
  private getSuggestedStatus(loan: Loan, currentBalances: LoanCalculationUpdate | null): LoanStatus {
    if (!currentBalances) {
      return loan.status;
    }

    // If loan is fully paid
    if (currentBalances.outstandingPrincipal <= 0) {
      return LoanStatus.CLOSED;
    }

    // Status based on days in arrears
    if (currentBalances.daysInArrears <= 30) {
      return LoanStatus.PERFORMING;
    } else if (currentBalances.daysInArrears <= 90) {
      return LoanStatus.WATCH;
    } else if (currentBalances.daysInArrears <= 180) {
      return LoanStatus.SUBSTANDARD;
    } else if (currentBalances.daysInArrears <= 365) {
      return LoanStatus.DOUBTFUL;
    } else {
      return LoanStatus.LOSS;
    }
  }

  async getUnassignedPendingLoans(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      // Get loans that are pending and have no workflow
      const loanQueryBuilder = this.loanRepository
        .createQueryBuilder('loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.collaterals', 'collaterals')
        .leftJoinAndSelect('loan.organization', 'organization')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere('loan.status = :status', { status: LoanStatus.PENDING });

      // Subquery to find loans with workflows
      const loansWithWorkflow = this.workflowRepository
        .createQueryBuilder('workflow')
        .select('workflow.loanId')
        .where('workflow.organizationId = :organizationId', { organizationId });

      // Exclude loans that have workflows
      loanQueryBuilder.andWhere(`loan.id NOT IN (${loansWithWorkflow.getQuery()})`);
      loanQueryBuilder.setParameters(loansWithWorkflow.getParameters());

      if (search) {
        loanQueryBuilder.andWhere(
          '(loan.loanId ILIKE :search OR loan.purposeOfLoan ILIKE :search OR ' +
          'borrower.firstName ILIKE :search OR borrower.lastName ILIKE :search OR ' +
          'borrower.nationalId ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      loanQueryBuilder.orderBy('loan.createdAt', 'DESC');

      const [loans, totalItems] = await loanQueryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      // Enhance loans with workflow status
      const enhancedLoans = loans.map(loan => ({
        ...loan,
        workflowStatus: 'unassigned',
        currentStep: null,
        assignedTo: null
      }));

      return {
        success: true,
        message: "Unassigned pending loans retrieved successfully",
        data: enhancedLoans,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
        }
      };

    } catch (error: any) {
      console.error("Get unassigned pending loans error:", error);
      return {
        success: false,
        message: "Failed to retrieve unassigned pending loans"
      };
    }
  }


  async addLoanReviewWithWorkflow(
    loanId: number,
    reviewMessage: string,
    reviewedBy: number,
    organizationId: number,
    workflowData: {
      reviewerRole: WorkflowStep;
      decision?: ReviewDecision;
      forwardToIds?: number[] | null;
      forwardToRoles?: string[] | null;
      workflowStep?: number;
      reviewAttachment?: {
        url: string;
        filename: string;
      } | null;
      loanAnalysisNote?: string | null;
    }
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    console.log('=== ADD LOAN REVIEW WITH WORKFLOW (ENHANCED) START ===');
    console.log('Received reviewMessage:', reviewMessage?.substring(0, 50) + '...');
    console.log('Received loanAnalysisNote:', workflowData.loanAnalysisNote ? 'YES (length: ' + workflowData.loanAnalysisNote.length + ')' : 'NO');

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // 1. Find the loan with borrower information
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['borrower', 'organization']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // 2. Get reviewer information
      const reviewer = await this.userRepository.findOne({
        where: { id: reviewedBy, organizationId }
      });

      if (!reviewer) {
        throw new Error("Reviewer not found");
      }

      // ✅ FIX: Get actual user role and map it to WorkflowStep
      let actualReviewerRole: WorkflowStep;

      // Map UserRole to WorkflowStep
      switch (reviewer.role) {
        case UserRole.CLIENT:
        case UserRole.MANAGING_DIRECTOR:
          actualReviewerRole = WorkflowStep.MANAGING_DIRECTOR;
          break;
        case UserRole.BOARD_DIRECTOR:
          actualReviewerRole = WorkflowStep.BOARD_DIRECTOR;
          break;
        case UserRole.SENIOR_MANAGER:
          actualReviewerRole = WorkflowStep.SENIOR_MANAGER;
          break;
        case UserRole.LOAN_OFFICER:
          actualReviewerRole = WorkflowStep.LOAN_OFFICER;
          break;
        case UserRole.CREDIT_OFFICER:
          actualReviewerRole = WorkflowStep.CREDIT_OFFICER;
          break;
        default:
          actualReviewerRole = WorkflowStep.CREDIT_OFFICER;
      }

      console.log(`✓ Reviewer: ${reviewer.username}, Role: ${reviewer.role}, Mapped to WorkflowStep: ${actualReviewerRole}`);

      // ✅ Validate forwardToIds if provided
      if (workflowData.forwardToIds && workflowData.forwardToIds.length > 0) {
        // Verify all users exist and are active
        const forwardUsers = await this.userRepository.find({
          where: {
            id: In(workflowData.forwardToIds),
            organizationId,
            isActive: true
          }
        });

        if (forwardUsers.length !== workflowData.forwardToIds.length) {
          throw new Error("One or more forward recipients not found or inactive");
        }
      }

      // ✅ Update loanAnalysisNote in the Loan entity if provided
      if (workflowData.loanAnalysisNote) {
        console.log('✓ Updating loanAnalysisNote in Loan table...');
        await queryRunner.manager.update(
          Loan,
          { id: loanId },
          {
            loanAnalysisNote: workflowData.loanAnalysisNote,
            updatedAt: new Date()
          }
        );
        console.log('✓ loanAnalysisNote updated successfully in Loan table');
      }

      // ✅ FIX: Use actual reviewer role instead of hardcoded workflowData.reviewerRole
      const review = this.loanReviewRepository.create({
        loanId,
        reviewedBy,
        reviewMessage: reviewMessage.trim(),
        status: ReviewStatus.REVIEWED,
        organizationId,
        reviewerRole: actualReviewerRole, // ✅ Use actual mapped role
        workflowStep: workflowData.workflowStep,
        decision: workflowData.decision,
        forwardedToId: workflowData.forwardToIds ? workflowData.forwardToIds[0] : null,
        forwardToIds: workflowData.forwardToIds,
        forwardToRoles: workflowData.forwardToRoles,
        reviewAttachmentUrl: workflowData.reviewAttachment?.url || null,
        reviewAttachmentName: workflowData.reviewAttachment?.filename || null,
        loanAnalysisNote: workflowData.loanAnalysisNote,
        reviewedAt: new Date()
      });

      const savedReview = await queryRunner.manager.save(review);
      console.log('✓ Review saved with enhanced workflow context:', savedReview.id);

      // Send email notifications
      try {
        const reviewCount = await this.loanReviewRepository.count({
          where: { loanId, isActive: true }
        });

        const reviewUrl = `${process.env.FRONTEND_URL}/dashboard/client/loanmanagement/pendingLoan`;
        const reviewerName = `${reviewer.firstName || ''} ${reviewer.lastName || reviewer.username}`.trim();
        const borrowerName = `${loan.borrower.firstName} ${loan.borrower.lastName}`;

        if (workflowData.forwardToIds && workflowData.forwardToIds.length > 0) {
          const forwardedUsers = await this.userRepository.find({
            where: {
              id: In(workflowData.forwardToIds),
              organizationId,
              isActive: true
            }
          });

          const emailPromises = forwardedUsers
            .filter(user => user.email && user.id !== reviewedBy)
            .map(user =>
              sendLoanReviewedEmail(
                user.email!,
                `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
                user.role as any,
                borrowerName,
                loan.loanId,
                loan.disbursedAmount,
                reviewerName,
                reviewMessage.trim(),
                reviewCount,
                reviewUrl
              ).catch(error => {
                console.error(`Failed to send email to ${user.email}:`, error);
                return null;
              })
            );

          await Promise.all(emailPromises);
          console.log(`✓ Sent ${emailPromises.length} notification emails`);
        }
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }

      await queryRunner.commitTransaction();

      // Load complete review with relations
      const completeReview = await this.loanReviewRepository.findOne({
        where: { id: savedReview.id },
        relations: ['reviewer', 'loan', 'loan.borrower', 'forwardedTo']
      });

      return {
        success: true,
        message: "Review added successfully with enhanced workflow",
        data: {
          review: completeReview,
          emailsSent: true,
          workflowData: {
            reviewerRole: actualReviewerRole, // ✅ Use actual role in response
            decision: workflowData.decision,
            forwardToIds: workflowData.forwardToIds,
            forwardToRoles: workflowData.forwardToRoles,
            hasAttachment: !!workflowData.reviewAttachment,
            hasLoanAnalysisNote: !!workflowData.loanAnalysisNote
          }
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("=== ADD LOAN REVIEW WITH WORKFLOW ERROR ===", error);

      return {
        success: false,
        message: error.message || "Failed to add loan review",
      };
    } finally {
      await queryRunner.release();
    }
  }

  async extendGuarantor(
    guarantorId: number,
    organizationId: number,
    extendedData: ExtendedGuarantorData,
    updatedBy: number | null = null
  ): Promise<ServiceResponse> {
    try {
      const guarantor = await this.guarantorRepository.findOne({
        where: { id: guarantorId, organizationId }
      });

      if (!guarantor) {
        return {
          success: false,
          message: "Guarantor not found",
        };
      }

      // Update guarantor with extended data
      Object.assign(guarantor, {
        ...extendedData,
        updatedBy,
        updatedAt: new Date()
      });

      const updatedGuarantor = await this.guarantorRepository.save(guarantor);

      return {
        success: true,
        message: "Guarantor information extended successfully",
        data: updatedGuarantor
      };
    } catch (error: any) {
      console.error("Extend guarantor error:", error);
      return {
        success: false,
        message: "Failed to extend guarantor information",
      };
    }
  }

  /**
   * Get all guarantors for a loan with extended information
   */
  async getLoanGuarantorsExtended(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const guarantors = await this.guarantorRepository.find({
        where: {
          loanId,
          organizationId,
          isActive: true
        },
        relations: ['collateral', 'borrower', 'loan'],
        order: { createdAt: 'DESC' }
      });

      // Separate extended and non-extended guarantors
      const extended = guarantors.filter(g => g.isExtended());
      const nonExtended = guarantors.filter(g => !g.isExtended());

      return {
        success: true,
        message: "Guarantors retrieved successfully",
        data: {
          all: guarantors,
          extended,
          nonExtended,
          total: guarantors.length,
          extendedCount: extended.length,
          needsExtension: nonExtended.length
        }
      };
    } catch (error: any) {
      console.error("Get loan guarantors error:", error);
      return {
        success: false,
        message: "Failed to retrieve guarantors",
      };
    }
  }

  /**
   * ✅ FIXED: Get all guarantors needing extension with proper pagination and complete info
   */
  async getGuarantorsNeedingExtension(
    organizationId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const [guarantors, total] = await this.guarantorRepository.findAndCount({
        where: {
          organizationId,
          isActive: true
        },
        relations: ['loan', 'borrower'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit
      });

      // We remove the filter and return all guarantors
      return {
        success: true,
        message: "Guarantors retrieved successfully",
        data: guarantors, // Now includes both extended and non-extended
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error: any) {
      console.error("Get guarantors needing extension error:", error);
      return {
        success: false,
        message: "Failed to retrieve guarantors",
      };
    }
  }


  /**
   * Bulk extend multiple guarantors
   */
  async bulkExtendGuarantors(
    guarantorUpdates: Array<{ guarantorId: number; extendedData: ExtendedGuarantorData }>,
    organizationId: number,
    updatedBy: number | null = null
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const results = [];
      const errors = [];

      for (const update of guarantorUpdates) {
        try {
          const guarantor = await queryRunner.manager.findOne(Guarantor, {
            where: { id: update.guarantorId, organizationId }
          });

          if (!guarantor) {
            errors.push({
              guarantorId: update.guarantorId,
              error: 'Guarantor not found'
            });
            continue;
          }

          Object.assign(guarantor, {
            ...update.extendedData,
            updatedBy,
            updatedAt: new Date()
          });

          const saved = await queryRunner.manager.save(guarantor);
          results.push(saved);

        } catch (error: any) {
          errors.push({
            guarantorId: update.guarantorId,
            error: error.message
          });
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `Successfully extended ${results.length} guarantors`,
        data: {
          updated: results,
          errors,
          successCount: results.length,
          errorCount: errors.length
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Bulk extend guarantors error:", error);
      return {
        success: false,
        message: "Failed to bulk extend guarantors",
      };
    } finally {
      await queryRunner.release();
    }
  }



  /**
   * Fetch existing guarantor data from loan collaterals for migration
   */
  async getExistingGuarantorData(
    organizationId: number,
    page: number = 1,
    limit: number = 50
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      // Use query builder to join with loan and organization
      const queryBuilder = this.collateralRepository
        .createQueryBuilder('collateral')
        .leftJoinAndSelect('collateral.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.organization', 'organization')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere('collateral.guarantorName IS NOT NULL')
        .andWhere('collateral.guarantorPhone IS NOT NULL')
        .orderBy('collateral.createdAt', 'DESC')
        .skip(skip)
        .take(limit);

      const [collaterals, total] = await queryBuilder.getManyAndCount();

      // Check which ones already have guarantors
      const collateralIds = collaterals.map(c => c.id);
      let migratedCollateralIds: number[] = [];

      if (collateralIds.length > 0) {
        const existingCheck = await this.checkExistingGuarantors(collateralIds, organizationId);
        if (existingCheck.success) {
          migratedCollateralIds = existingCheck.data.migratedCollateralIds;
        }
      }

      // Format the data for frontend display
      const guarantorData = collaterals.map(collateral => ({
        collateralId: collateral.id,
        loanId: collateral.loanId,
        borrowerId: collateral.loan.borrowerId,
        organizationId: collateral.loan.organizationId, // Get from loan, not collateral
        name: collateral.guarantorName,
        phone: collateral.guarantorPhone,
        address: collateral.guarantorAddress || '',
        guaranteedAmount: collateral.collateralValue,
        collateralType: collateral.collateralType,
        upiNumber: collateral.upiNumber,
        collateralDescription: collateral.description,
        loanInfo: {
          loanId: collateral.loan.loanId,
          borrowerName: collateral.loan.borrower.fullName,
          disbursedAmount: collateral.loan.disbursedAmount,
          loanStatus: collateral.loan.status
        },
        // Check if already migrated
        alreadyMigrated: migratedCollateralIds.includes(collateral.id)
      }));

      return {
        success: true,
        message: "Existing guarantor data retrieved successfully",
        data: guarantorData,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error: any) {
      console.error("Get existing guarantor data error:", error);
      return {
        success: false,
        message: "Failed to retrieve existing guarantor data",
      };
    }
  }

  /**
   * Check if guarantors already exist for specific collaterals
   */
  async checkExistingGuarantors(
    collateralIds: number[],
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const existingGuarantors = await this.guarantorRepository.find({
        where: {
          collateralId: In(collateralIds),
          organizationId
        },
        select: ['collateralId']
      });

      const migratedCollateralIds = existingGuarantors.map(g => g.collateralId);

      return {
        success: true,
        message: "Migration status checked successfully",
        data: {
          migratedCollateralIds,
          totalMigrated: migratedCollateralIds.length,
          totalRequested: collateralIds.length
        }
      };
    } catch (error: any) {
      console.error("Check existing guarantors error:", error);
      return {
        success: false,
        message: "Failed to check migration status",
      };
    }
  }

  /**
   * Bulk migrate guarantors from collaterals to guarantor table
   */
  async bulkMigrateGuarantors(
    migrationData: Array<{
      collateralId: number;
      loanId: number;
      borrowerId: number;
      organizationId: number;
    }>,
    createdBy: number | null = null
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      console.log(`=== STARTING BULK GUARANTOR MIGRATION FOR ${migrationData.length} RECORDS ===`);

      const results = {
        successful: [] as any[],
        failed: [] as any[],
        skipped: [] as any[]
      };

      for (const data of migrationData) {
        try {
          // Check if collateral exists and has guarantor data using query builder
          const collateral = await queryRunner.manager
            .createQueryBuilder(LoanCollateral, 'collateral')
            .leftJoinAndSelect('collateral.loan', 'loan')
            .where('collateral.id = :collateralId', { collateralId: data.collateralId })
            .andWhere('loan.organizationId = :organizationId', { organizationId: data.organizationId })
            .getOne();

          if (!collateral) {
            results.failed.push({
              collateralId: data.collateralId,
              error: 'Collateral not found or does not belong to organization'
            });
            continue;
          }

          // Check if guarantor data exists in collateral
          if (!collateral.guarantorName || !collateral.guarantorPhone) {
            results.skipped.push({
              collateralId: data.collateralId,
              reason: 'No guarantor data in collateral'
            });
            continue;
          }

          // Check if guarantor already exists for this collateral
          const existingGuarantor = await queryRunner.manager.findOne(Guarantor, {
            where: {
              collateralId: data.collateralId,
              organizationId: data.organizationId
            }
          });

          if (existingGuarantor) {
            results.skipped.push({
              collateralId: data.collateralId,
              reason: 'Guarantor already exists'
            });
            continue;
          }

          // Create new guarantor record
          const guarantor = this.guarantorRepository.create({
            loanId: data.loanId,
            collateralId: data.collateralId,
            borrowerId: data.borrowerId,
            organizationId: data.organizationId,
            name: collateral.guarantorName,
            phone: collateral.guarantorPhone,
            address: collateral.guarantorAddress || '',
            guaranteedAmount: collateral.collateralValue,
            collateralType: collateral.collateralType,
            upiNumber: collateral.upiNumber,
            collateralDescription: collateral.description,
            createdBy,
            isActive: true
          });

          const savedGuarantor = await queryRunner.manager.save(guarantor);

          results.successful.push({
            collateralId: data.collateralId,
            guarantorId: savedGuarantor.id,
            name: savedGuarantor.name,
            phone: savedGuarantor.phone,
            guaranteedAmount: savedGuarantor.guaranteedAmount
          });

          console.log(`✓ Migrated guarantor for collateral ${data.collateralId}: ${savedGuarantor.name}`);

        } catch (error: any) {
          results.failed.push({
            collateralId: data.collateralId,
            error: error.message
          });
          console.error(`✗ Failed to migrate collateral ${data.collateralId}:`, error.message);
        }
      }

      await queryRunner.commitTransaction();
      console.log(`=== BULK MIGRATION COMPLETED: ${results.successful.length} successful, ${results.failed.length} failed, ${results.skipped.length} skipped ===`);

      return {
        success: true,
        message: `Guarantor migration completed: ${results.successful.length} successful, ${results.failed.length} failed, ${results.skipped.length} skipped`,
        data: results
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Bulk migrate guarantors error:", error);
      return {
        success: false,
        message: "Failed to bulk migrate guarantors",
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Quick migration - migrate all eligible collaterals at once
   */
  async quickMigrateAllGuarantors(
    organizationId: number,
    createdBy: number | null = null
  ): Promise<ServiceResponse> {
    try {
      // Find all collaterals with guarantor data using query builder
      const collaterals = await this.collateralRepository
        .createQueryBuilder('collateral')
        .leftJoinAndSelect('collateral.loan', 'loan')
        .where('loan.organizationId = :organizationId', { organizationId })
        .andWhere('collateral.guarantorName IS NOT NULL')
        .andWhere('collateral.guarantorPhone IS NOT NULL')
        .getMany();

      // Check which ones already have guarantors
      const collateralIds = collaterals.map(c => c.id);
      const existingCheck = await this.checkExistingGuarantors(collateralIds, organizationId);

      if (!existingCheck.success) {
        return existingCheck;
      }

      const migratedCollateralIds = existingCheck.data.migratedCollateralIds;

      // Prepare migration data for non-migrated collaterals
      const migrationData = collaterals
        .filter(collateral => !migratedCollateralIds.includes(collateral.id))
        .map(collateral => ({
          collateralId: collateral.id,
          loanId: collateral.loanId,
          borrowerId: collateral.loan.borrowerId,
          organizationId
        }));

      if (migrationData.length === 0) {
        return {
          success: true,
          message: "No new guarantors to migrate - all existing guarantor data has already been migrated",
          data: {
            totalEligible: collaterals.length,
            alreadyMigrated: migratedCollateralIds.length,
            newlyMigrated: 0
          }
        };
      }

      // Perform bulk migration
      const migrationResult = await this.bulkMigrateGuarantors(migrationData, createdBy);

      if (migrationResult.success) {
        return {
          success: true,
          message: `Quick migration completed: ${migrationResult.data.successful.length} guarantors migrated successfully`,
          data: {
            ...migrationResult.data,
            totalEligible: collaterals.length,
            alreadyMigrated: migratedCollateralIds.length
          }
        };
      } else {
        return migrationResult;
      }

    } catch (error: any) {
      console.error("Quick migrate all guarantors error:", error);
      return {
        success: false,
        message: "Failed to quick migrate guarantors",
      };
    }
  }



  async getAllCollaterals(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search: string = ''
  ): Promise<ServiceResponse> {
    try {
      console.log('=== GET ALL COLLATERALS START ===');
      console.log('Organization ID:', organizationId);
      console.log('Page:', page, 'Limit:', limit, 'Search:', search);

      // Build query with proper relations
      const queryBuilder = this.collateralRepository
        .createQueryBuilder('collateral')
        .leftJoinAndSelect('collateral.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.organization', 'organization')
        .where('organization.id = :organizationId', { organizationId })
        .andWhere('collateral.isActive = :isActive', { isActive: true });

      // Add search functionality
      if (search) {
        queryBuilder.andWhere(
          '(collateral.collateralId LIKE :search OR ' +
          'collateral.description LIKE :search OR ' +
          'collateral.guarantorName LIKE :search OR ' +
          'borrower.firstName LIKE :search OR ' +
          'borrower.lastName LIKE :search)',
          { search: `%${search}%` }
        );
      }

      // Get total count
      const totalItems = await queryBuilder.getCount();

      // Apply pagination
      const skip = (page - 1) * limit;
      queryBuilder
        .orderBy('collateral.createdAt', 'DESC')
        .skip(skip)
        .take(limit);

      const collaterals = await queryBuilder.getMany();

      console.log(`✓ Found ${collaterals.length} collaterals`);
      console.log('=== GET ALL COLLATERALS END ===');

      return {
        success: true,
        message: "Collaterals retrieved successfully",
        data: collaterals,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: page,
          total: totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error: any) {
      console.error("=== GET ALL COLLATERALS ERROR ===", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve collaterals"
      };
    }
  }

  /**
   * Extend collateral with additional fields
   * Updated to properly save all extended fields to database
   */
  async extendCollateral(
    collateralId: number,
    organizationId: number,
    extendedData: {
      accountNumber?: string;
      collateralType?: string;
      upiNumber?: string;
      collateralValue?: number;
      collateralLastValuationDate?: string;
      collateralExpiryDate?: string;
    }
  ): Promise<ServiceResponse> {
    try {
      console.log('=== EXTEND COLLATERAL START ===');
      console.log('Collateral ID:', collateralId);
      console.log('Organization ID:', organizationId);
      console.log('Extended Data:', extendedData);

      // Find collateral and verify ownership
      const collateral = await this.collateralRepository
        .createQueryBuilder('collateral')
        .leftJoinAndSelect('collateral.loan', 'loan')
        .leftJoinAndSelect('loan.organization', 'organization')
        .where('collateral.id = :collateralId', { collateralId })
        .andWhere('organization.id = :organizationId', { organizationId })
        .andWhere('collateral.isActive = :isActive', { isActive: true })
        .getOne();

      if (!collateral) {
        return {
          success: false,
          message: "Collateral not found or access denied"
        };
      }

      // Prepare update data with proper field mapping
      const updateData: Partial<LoanCollateral> = {};

      // Account Number
      if (extendedData.accountNumber !== undefined) {
        updateData.accountNumber = extendedData.accountNumber?.trim() || null;
        console.log('✓ Setting accountNumber:', updateData.accountNumber);
      }

      // Extended Collateral Type
      if (extendedData.collateralType !== undefined) {
        updateData.extendedCollateralType = extendedData.collateralType?.trim() || null;
        console.log('✓ Setting extendedCollateralType:', updateData.extendedCollateralType);
      }

      // UPI Number
      if (extendedData.upiNumber !== undefined) {
        updateData.upiNumber = extendedData.upiNumber?.trim() || null;
        console.log('✓ Setting upiNumber:', updateData.upiNumber);
      }

      // Extended Collateral Value
      if (extendedData.collateralValue !== undefined) {
        const value = Number(extendedData.collateralValue);
        if (isNaN(value) || value < 0) {
          return {
            success: false,
            message: "Invalid collateral value"
          };
        }
        updateData.extendedCollateralValue = value;
        console.log('✓ Setting extendedCollateralValue:', updateData.extendedCollateralValue);
      }

      // Collateral Last Valuation Date
      if (extendedData.collateralLastValuationDate !== undefined) {
        try {
          const date = new Date(extendedData.collateralLastValuationDate);
          if (isNaN(date.getTime())) {
            return {
              success: false,
              message: "Invalid collateral last valuation date"
            };
          }
          updateData.collateralLastValuationDate = date;
          console.log('✓ Setting collateralLastValuationDate:', updateData.collateralLastValuationDate);
        } catch (error) {
          return {
            success: false,
            message: "Invalid collateral last valuation date format"
          };
        }
      }

      // Collateral Expiry Date
      if (extendedData.collateralExpiryDate !== undefined) {
        try {
          const date = new Date(extendedData.collateralExpiryDate);
          if (isNaN(date.getTime())) {
            return {
              success: false,
              message: "Invalid collateral expiry date"
            };
          }
          updateData.collateralExpiryDate = date;
          console.log('✓ Setting collateralExpiryDate:', updateData.collateralExpiryDate);
        } catch (error) {
          return {
            success: false,
            message: "Invalid collateral expiry date format"
          };
        }
      }

      // Update timestamp
      updateData.updatedAt = new Date();

      // Log what we're about to save
      console.log('Fields to update:', Object.keys(updateData));
      console.log('Update data:', updateData);

      // Merge and save using repository
      Object.assign(collateral, updateData);

      // Save to database
      const savedCollateral = await this.collateralRepository.save(collateral);

      console.log('✓ Collateral saved successfully. ID:', savedCollateral.id);
      console.log('✓ Saved accountNumber:', savedCollateral.accountNumber);
      console.log('✓ Saved extendedCollateralType:', savedCollateral.extendedCollateralType);
      console.log('✓ Saved extendedCollateralValue:', savedCollateral.extendedCollateralValue);
      console.log('✓ Saved collateralLastValuationDate:', savedCollateral.collateralLastValuationDate);
      console.log('✓ Saved collateralExpiryDate:', savedCollateral.collateralExpiryDate);
      console.log('=== EXTEND COLLATERAL END ===');

      // Fetch complete collateral with all relations for response
      const completeCollateral = await this.collateralRepository
        .createQueryBuilder('collateral')
        .leftJoinAndSelect('collateral.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('loan.organization', 'organization')
        .where('collateral.id = :collateralId', { collateralId: savedCollateral.id })
        .getOne();

      return {
        success: true,
        message: "Collateral extended successfully",
        data: {
          ...completeCollateral,
          // Include computed fields
          effectiveValue: completeCollateral?.effectiveValue,
          valuationBreakdown: completeCollateral?.getValuationBreakdown(),
          needsRevaluation: completeCollateral?.needsRevaluation(),
          isExpired: completeCollateral?.isExpired(),
          daysUntilExpiry: completeCollateral?.getDaysUntilExpiry()
        }
      };
    } catch (error: any) {
      console.error("=== EXTEND COLLATERAL ERROR ===", error);
      return {
        success: false,
        message: error.message || "Failed to extend collateral"
      };
    }
  }

}
// Add this to your LoanApplicationService or create a new helper file

/**
 * Auto-Term Calculation Helper
 */
export class LoanTermCalculator {
  constructor(
    private loanRepository: Repository<Loan>,
    private loanReviewRepository: Repository<LoanReview>,
    private userRepository: Repository<User>
  ) {
    this.loanReviewRepository = dbConnection.getRepository(LoanReview);
    this.userRepository = dbConnection.getRepository(User);
  }
  static calculateAutoTerms(
    disbursementDate: Date,
    maturityDate: Date,
    frequency: RepaymentFrequency
  ): number {
    console.log('=== AUTO-TERM CALCULATION START ===');
    console.log('Input:', {
      disbursementDate: disbursementDate.toISOString(),
      maturityDate: maturityDate.toISOString(),
      frequency
    });

    // Ensure dates are valid
    if (!disbursementDate || !maturityDate) {
      throw new Error('Disbursement date and maturity date are required');
    }

    if (maturityDate <= disbursementDate) {
      throw new Error('Maturity date must be after disbursement date');
    }

    const diffTime = maturityDate.getTime() - disbursementDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Calculate months difference accurately
    const diffMonths = (maturityDate.getFullYear() - disbursementDate.getFullYear()) * 12 +
      (maturityDate.getMonth() - disbursementDate.getMonth());

    console.log('Date differences:', { diffDays, diffMonths });

    let autoTerms: number;

    switch (frequency) {
      case RepaymentFrequency.DAILY:
        autoTerms = Math.ceil(diffDays);
        break;

      case RepaymentFrequency.WEEKLY:
        autoTerms = Math.ceil(diffDays / 7);
        break;

      case RepaymentFrequency.BIWEEKLY:
        autoTerms = Math.ceil(diffDays / 14);
        break;

      case RepaymentFrequency.MONTHLY:
        autoTerms = Math.ceil(diffMonths);
        break;

      case RepaymentFrequency.QUARTERLY:
        autoTerms = Math.ceil(diffMonths / 3);
        break;

      case RepaymentFrequency.SEMI_ANNUALLY:
        autoTerms = Math.ceil(diffMonths / 6);
        break;

      case RepaymentFrequency.ANNUALLY:
        autoTerms = Math.ceil(diffMonths / 12);
        break;

      default:
        throw new Error(`Unsupported repayment frequency: ${frequency}`);
    }

    // Ensure minimum of 1 term
    autoTerms = Math.max(1, autoTerms);

    console.log('Auto terms calculated:', { frequency, autoTerms });
    console.log('=== AUTO-TERM CALCULATION END ===');

    return autoTerms;
  }


  // Add this method to LoanApplicationService class

// Add this method to LoanApplicationService class


  static convertTermsToYears(terms: number, frequency: RepaymentFrequency): number {
    const termsPerYear: Record<RepaymentFrequency, number> = {
      [RepaymentFrequency.DAILY]: 365,
      [RepaymentFrequency.WEEKLY]: 52,
      [RepaymentFrequency.BIWEEKLY]: 26,
      [RepaymentFrequency.MONTHLY]: 12,
      [RepaymentFrequency.QUARTERLY]: 4,
      [RepaymentFrequency.SEMI_ANNUALLY]: 2,
      [RepaymentFrequency.ANNUALLY]: 1
    };

    return terms / termsPerYear[frequency];
  }

  /**
   * Get periodic interest rate based on frequency
   */
  static getPeriodicRate(annualRate: number, frequency: RepaymentFrequency): number {
    const periodsPerYear: Record<RepaymentFrequency, number> = {
      [RepaymentFrequency.DAILY]: 365,
      [RepaymentFrequency.WEEKLY]: 52,
      [RepaymentFrequency.BIWEEKLY]: 26,
      [RepaymentFrequency.MONTHLY]: 12,
      [RepaymentFrequency.QUARTERLY]: 4,
      [RepaymentFrequency.SEMI_ANNUALLY]: 2,
      [RepaymentFrequency.ANNUALLY]: 1
    };

    return annualRate / 100 / periodsPerYear[frequency];
  }





  /**
   * Calculate first payment date considering grace period
   */
  static calculateFirstPaymentDate(
    disbursementDate: Date,
    frequency: RepaymentFrequency,
    gracePeriodMonths: number = 0
  ): Date {
    const firstPaymentDate = new Date(disbursementDate);

    // Add grace period
    if (gracePeriodMonths > 0) {
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() + gracePeriodMonths);
    }

    // Add one period based on frequency
    switch (frequency) {
      case RepaymentFrequency.DAILY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 1);
        break;
      case RepaymentFrequency.WEEKLY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 7);
        break;
      case RepaymentFrequency.BIWEEKLY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 14);
        break;
      case RepaymentFrequency.MONTHLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
        break;
      case RepaymentFrequency.QUARTERLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 3);
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 6);
        break;
      case RepaymentFrequency.ANNUALLY:
        firstPaymentDate.setFullYear(firstPaymentDate.getFullYear() + 1);
        break;
    }

    return firstPaymentDate;
  }

  /**
   * Calculate installment due date based on frequency
   */
  static calculateInstallmentDueDate(
    firstPaymentDate: Date,
    installmentNumber: number,
    frequency: RepaymentFrequency
  ): Date {
    const dueDate = new Date(firstPaymentDate);

    switch (frequency) {
      case RepaymentFrequency.DAILY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1));
        break;
      case RepaymentFrequency.WEEKLY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1) * 7);
        break;
      case RepaymentFrequency.BIWEEKLY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1) * 14);
        break;
      case RepaymentFrequency.MONTHLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1));
        break;
      case RepaymentFrequency.QUARTERLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 3);
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 6);
        break;
      case RepaymentFrequency.ANNUALLY:
        dueDate.setFullYear(dueDate.getFullYear() + (installmentNumber - 1));
        break;
    }

    return dueDate;
  }

}
