// @ts-nocheck
import { Repository, Between, LessThan, MoreThan, In } from "typeorm";
import { Organization } from "../entities/Organization";
import { User } from "../entities/User";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import { Loan, LoanStatus } from "../entities/Loan";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import { Transaction } from "../entities/Transaction";
import dbConnection from "../db";

export interface OrganizationPerformanceMetrics {
  organizationId: number;
  organizationName: string;
  organizationTin?: string | null;
  organizationLogo?: string | null;
  isActive: boolean;
  
  // User metrics
  userMetrics: {
    totalUsers: number;
    usersByRole: Record<string, number>;
    activeUsers: number;
    inactiveUsers: number;
    systemOwnerCount: number;
    clientCount: number;
    managerCount: number;
    loanOfficerCount: number;
    boardDirectorCount: number;
    seniorManagerCount: number;
    managingDirectorCount: number;
    staffCount: number;
    auditorCount: number;
    supportCount: number;
    businessOfficerCount: number;
    creditOfficerCount: number;
    financeOfficerCount: number;
    lastLoginActivity: Array<{
      userId: number;
      username: string;
      email: string;
      role: string;
      lastLoginAt: Date | null;
    }>;
  };
  
  // Borrower metrics
  borrowerMetrics: {
    totalBorrowers: number;
    borrowersWithClientAccount: number;
    borrowersWithoutClientAccount: number;
    clientAccountCoverage: number; // percentage
    individualBorrowers: number;
    institutionBorrowers: number;
    borrowersByGender: Record<string, number>;
    borrowersByMaritalStatus: Record<string, number>;
    borrowersByRelationship: Record<string, number>;
    topBorrowersByLoanCount: Array<{
      borrowerId: number;
      borrowerName: string;
      nationalId: string;
      loanCount: number;
      totalDisbursed: number;
      hasClientAccount: boolean;
    }>;
  };
  
  // Client Account metrics
  clientAccountMetrics: {
    totalClientAccounts: number;
    accountsWithLoans: number;
    accountsWithoutLoans: number;
    accountsByType: Record<string, number>;
    averageLoansPerAccount: number;
    totalLoansAcrossAccounts: number;
    topAccountsByLoanCount: Array<{
      accountId: number;
      accountNumber: string;
      borrowerName: string;
      borrowerType: string;
      loanCount: number;
      totalDisbursed: number;
    }>;
  };
  
  // Loan performance metrics
  loanMetrics: {
    totalLoans: number;
    totalDisbursed: number;
    totalOutstandingPrincipal: number;
    totalAccruedInterest: number;
    totalOutstandingBalance: number;
    
    // Status breakdown
    loansByStatus: Record<string, {
      count: number;
      amount: number;
      percentage: number;
    }>;
    
    // Loan classification
    performingLoans: {
      count: number;
      amount: number;
      percentage: number;
    };
    nonPerformingLoans: {
      count: number;
      amount: number;
      percentage: number;
      nplRatio: number;
    };
    
    // PAR metrics
    portfolioAtRisk: {
      par30: {
        count: number;
        amount: number;
        percentage: number;
      };
      par90: {
        count: number;
        amount: number;
        percentage: number;
      };
      par180: {
        count: number;
        amount: number;
        percentage: number;
      };
    };
    
    // Repayment performance
    repaymentMetrics: {
      collectionRate: number;
      averageDaysInArrears: number;
      loansInArrears: number;
      totalArrearsAmount: number;
      loansOnSchedule: number;
    };
    
    // Provisioning
    provisioningMetrics: {
      totalProvisionRequired: number;
      averageProvisionRate: number;
    };
    
    // Interest & Terms
    averageInterestRate: number;
    averageLoanTerm: number;
    averageLoanSize: number;
    
    // Top loans
    largestLoans: Array<{
      loanId: string;
      borrowerName: string;
      amount: number;
      status: string;
      outstandingBalance: number;
    }>;
    
    // Recent loans
    recentLoans: Array<{
      loanId: string;
      borrowerName: string;
      amount: number;
      status: string;
      disbursedAt: Date;
    }>;
    
    // Loan officer performance
    loanOfficerPerformance: Array<{
      officerId: number;
      officerName: string;
      totalLoansManaged: number;
      totalDisbursed: number;
      performingLoans: number;
      nonPerformingLoans: number;
      collectionRate: number;
    }>;
  };
  
  // Borrower type loan distribution
  borrowerTypeLoanDistribution: {
    individual: {
      count: number;
      amount: number;
      averageLoanSize: number;
    };
    institution: {
      count: number;
      amount: number;
      averageLoanSize: number;
    };
  };
  
  // Temporal metrics
  temporalMetrics: {
    loansByMonth: Array<{
      month: string;
      count: number;
      amount: number;
    }>;
    disbursementsByMonth: Array<{
      month: string;
      amount: number;
    }>;
    repaymentsByMonth: Array<{
      month: string;
      amount: number;
    }>;
  };
  
  // Performance scorecard
  performanceScorecard: {
    overallScore: number;
    metrics: Array<{
      name: string;
      value: number;
      target: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      score: number;
    }>;
  };
  
  // Summary
  summary: {
    healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    keyStrengths: string[];
    keyWeaknesses: string[];
    recommendations: string[];
  };
  
  reportGeneratedAt: Date;
}

export interface PerformanceReportRequest {
  organizationId?: number; // If not provided, get all organizations
  asOfDate?: string;
  includeDetails?: boolean;
  includeUsers?: boolean;
  includeBorrowers?: boolean;
  includeLoans?: boolean;
  includeClientAccounts?: boolean;
}

export interface OrganizationPerformanceResponse {
  success: boolean;
  message: string;
  data?: {
    reportDate: Date;
    totalOrganizations: number;
    organizations: OrganizationPerformanceMetrics[];
    summary: {
      totalUsers: number;
      totalBorrowers: number;
      totalClientAccounts: number;
      totalLoans: number;
      totalDisbursed: number;
      totalOutstanding: number;
      overallNPL: number;
      topPerformingOrganizations: Array<{
        id: number;
        name: string;
        score: number;
      }>;
      organizationsByHealth: Record<string, number>;
    };
  };
}

export class PerformanceAnalyticsService {
  private organizationRepository: Repository<Organization>;
  private userRepository: Repository<User>;
  private borrowerRepository: Repository<BorrowerProfile>;
  private loanRepository: Repository<Loan>;
  private clientAccountRepository: Repository<ClientBorrowerAccount>;
  private repaymentScheduleRepository: Repository<RepaymentSchedule>;
  private transactionRepository: Repository<Transaction>;

  constructor() {
    this.organizationRepository = dbConnection.getRepository(Organization);
    this.userRepository = dbConnection.getRepository(User);
    this.borrowerRepository = dbConnection.getRepository(BorrowerProfile);
    this.loanRepository = dbConnection.getRepository(Loan);
    this.clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);
    this.repaymentScheduleRepository = dbConnection.getRepository(RepaymentSchedule);
    this.transactionRepository = dbConnection.getRepository(Transaction);
  }

  /**
   * Get comprehensive performance metrics for all organizations or a specific one
   */
  async getOrganizationPerformance(
    request: PerformanceReportRequest
  ): Promise<OrganizationPerformanceResponse> {
    try {
      const asOfDate = request.asOfDate ? new Date(request.asOfDate) : new Date();
      
      // Build query for organizations
      const orgQuery = this.organizationRepository
        .createQueryBuilder('org')
        .where('org.isActive = :isActive', { isActive: true });
      
      if (request.organizationId) {
        orgQuery.andWhere('org.id = :orgId', { orgId: request.organizationId });
      }
      
      const organizations = await orgQuery.getMany();
      
      if (organizations.length === 0) {
        return {
          success: false,
          message: request.organizationId 
            ? `Organization with ID ${request.organizationId} not found` 
            : 'No active organizations found',
        };
      }

      // Process each organization
      const organizationMetrics: OrganizationPerformanceMetrics[] = [];
      
      for (const org of organizations) {
        const metrics = await this.calculateOrganizationMetrics(
          org.id,
          org.name,
          org.tinNumber,
          org.logoUrl,
          org.isActive,
          asOfDate,
          request
        );
        organizationMetrics.push(metrics);
      }

      // Calculate summary statistics
      const summary = this.calculateSummaryStatistics(organizationMetrics);

      return {
        success: true,
        message: `Performance data retrieved for ${organizationMetrics.length} organization(s)`,
        data: {
          reportDate: new Date(),
          totalOrganizations: organizationMetrics.length,
          organizations: organizationMetrics,
          summary,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to retrieve performance data: ${error.message}`,
      };
    }
  }

  /**
   * Calculate comprehensive metrics for a single organization
   */
  private async calculateOrganizationMetrics(
    orgId: number,
    orgName: string,
    orgTin: string | null | undefined,
    orgLogo: string | null | undefined,
    isActive: boolean,
    asOfDate: Date,
    options: PerformanceReportRequest
  ): Promise<OrganizationPerformanceMetrics> {
    
    // 1. Fetch all users for this organization
    const users = await this.userRepository.find({
      where: { organizationId: orgId, isActive: true },
      order: { lastLoginAt: 'DESC' },
    });

    // 2. Fetch all borrowers
    const borrowers = await this.borrowerRepository.find({
      where: { organizationId: orgId, isActive: true },
      relations: ['loans'],
    });

    // 3. Fetch all client accounts
    const clientAccounts = await this.clientAccountRepository.find({
      where: { organizationId: orgId, isActive: true },
      relations: ['loans', 'borrower'],
    });

    // 4. Fetch all loans with necessary relations
    const loans = await this.loanRepository.find({
      where: { organizationId: orgId, isActive: true },
      relations: ['borrower', 'repaymentSchedules', 'transactions', 'guarantors'],
    });

    // 5. Fetch recent transactions for repayment analysis
    const thirtyDaysAgo = new Date(asOfDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTransactions = await this.transactionRepository.find({
      where: {
        organizationId: orgId,
        createdAt: Between(thirtyDaysAgo, asOfDate),
      },
    });

    // Calculate metrics
    const userMetrics = this.calculateUserMetrics(users);
    const borrowerMetrics = this.calculateBorrowerMetrics(borrowers, clientAccounts);
    const clientAccountMetrics = this.calculateClientAccountMetrics(clientAccounts);
    const loanMetrics = this.calculateLoanMetrics(loans, recentTransactions, asOfDate);
    const borrowerTypeLoanDistribution = this.calculateBorrowerTypeDistribution(loans);
    const temporalMetrics = this.calculateTemporalMetrics(loans, recentTransactions);
    const performanceScorecard = this.calculatePerformanceScorecard(loanMetrics, borrowerMetrics, clientAccountMetrics);
    
    // Generate summary with strengths, weaknesses, and recommendations
    const summary = this.generateOrganizationSummary(
      orgName,
      userMetrics,
      borrowerMetrics,
      clientAccountMetrics,
      loanMetrics,
      performanceScorecard
    );

    return {
      organizationId: orgId,
      organizationName: orgName,
      organizationTin: orgTin,
      organizationLogo: orgLogo,
      isActive,
      
      userMetrics,
      borrowerMetrics,
      clientAccountMetrics,
      loanMetrics,
      borrowerTypeLoanDistribution,
      temporalMetrics,
      performanceScorecard,
      summary,
      
      reportGeneratedAt: new Date(),
    };
  }

  /**
   * Calculate user metrics
   */
  private calculateUserMetrics(users: User[]) {
    const usersByRole: Record<string, number> = {};
    
    // Initialize all roles with 0
    const roleNames = [
      'system_owner', 'client', 'manager', 'loan_officer', 'board_director',
      'senior_manager', 'managing_director', 'staff', 'auditor', 'support',
      'business_officer', 'credit_officer', 'finance_officer'
    ];
    
    roleNames.forEach(role => { usersByRole[role] = 0; });
    
    // Count users by role
    users.forEach(user => {
      if (user.role) {
        usersByRole[user.role] = (usersByRole[user.role] || 0) + 1;
      }
    });

    // Get last login activity (top 10)
    const lastLoginActivity = users
      .filter(u => u.lastLoginAt)
      .sort((a, b) => {
        if (!a.lastLoginAt) return 1;
        if (!b.lastLoginAt) return -1;
        return b.lastLoginAt.getTime() - a.lastLoginAt.getTime();
      })
      .slice(0, 10)
      .map(u => ({
        userId: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        lastLoginAt: u.lastLoginAt,
      }));

    const activeUsers = users.filter(u => u.isActive).length;
    const inactiveUsers = users.length - activeUsers;

    return {
      totalUsers: users.length,
      usersByRole,
      activeUsers,
      inactiveUsers,
      systemOwnerCount: usersByRole['system_owner'] || 0,
      clientCount: usersByRole['client'] || 0,
      managerCount: usersByRole['manager'] || 0,
      loanOfficerCount: usersByRole['loan_officer'] || 0,
      boardDirectorCount: usersByRole['board_director'] || 0,
      seniorManagerCount: usersByRole['senior_manager'] || 0,
      managingDirectorCount: usersByRole['managing_director'] || 0,
      staffCount: usersByRole['staff'] || 0,
      auditorCount: usersByRole['auditor'] || 0,
      supportCount: usersByRole['support'] || 0,
      businessOfficerCount: usersByRole['business_officer'] || 0,
      creditOfficerCount: usersByRole['credit_officer'] || 0,
      financeOfficerCount: usersByRole['finance_officer'] || 0,
      lastLoginActivity,
    };
  }

  /**
   * Calculate borrower metrics with focus on client accounts
   */
  private calculateBorrowerMetrics(
    borrowers: BorrowerProfile[],
    clientAccounts: ClientBorrowerAccount[]
  ) {
    // Create a set of borrower IDs that have client accounts
    const borrowerIdsWithClientAccount = new Set<number>();
    clientAccounts.forEach(account => {
      if (account.borrowerId) {
        borrowerIdsWithClientAccount.add(account.borrowerId);
      }
    });

    // Count borrowers with and without client accounts
    const borrowersWithClientAccount = borrowers.filter(b => 
      borrowerIdsWithClientAccount.has(b.id)
    ).length;
    
    const borrowersWithoutClientAccount = borrowers.length - borrowersWithClientAccount;
    
    // Client account coverage percentage
    const clientAccountCoverage = borrowers.length > 0
      ? (borrowersWithClientAccount / borrowers.length) * 100
      : 0;

    // Count by gender
    const borrowersByGender: Record<string, number> = {};
    borrowers.forEach(b => {
      if (b.gender) {
        borrowersByGender[b.gender] = (borrowersByGender[b.gender] || 0) + 1;
      }
    });

    // Count by marital status
    const borrowersByMaritalStatus: Record<string, number> = {};
    borrowers.forEach(b => {
      if (b.maritalStatus) {
        borrowersByMaritalStatus[b.maritalStatus] = (borrowersByMaritalStatus[b.maritalStatus] || 0) + 1;
      }
    });

    // Count by relationship
    const borrowersByRelationship: Record<string, number> = {};
    borrowers.forEach(b => {
      if (b.relationshipWithNDFSP) {
        borrowersByRelationship[b.relationshipWithNDFSP] = (borrowersByRelationship[b.relationshipWithNDFSP] || 0) + 1;
      }
    });

    // Count individual vs institution borrowers
    // This is inferred - individual borrowers have firstName/lastName, institutions are special
    // We'll count institutions as those with 'Institution' in firstName or special flag
    const individualBorrowers = borrowers.filter(b => 
      !b.firstName?.includes('Institution') && 
      !b.lastName?.includes('N/A')
    ).length;
    
    const institutionBorrowers = borrowers.length - individualBorrowers;

    // Top borrowers by loan count
    const topBorrowersByLoanCount = borrowers
      .filter(b => b.loans && b.loans.length > 0)
      .map(b => ({
        borrowerId: b.id,
        borrowerName: b.fullName,
        nationalId: b.nationalId || '',
        loanCount: b.loans?.length || 0,
        totalDisbursed: b.loans?.reduce((sum, l) => sum + (l.disbursedAmount || 0), 0) || 0,
        hasClientAccount: borrowerIdsWithClientAccount.has(b.id),
      }))
      .sort((a, b) => b.loanCount - a.loanCount)
      .slice(0, 10);

    return {
      totalBorrowers: borrowers.length,
      borrowersWithClientAccount,
      borrowersWithoutClientAccount,
      clientAccountCoverage: Math.round(clientAccountCoverage * 100) / 100,
      individualBorrowers,
      institutionBorrowers,
      borrowersByGender,
      borrowersByMaritalStatus,
      borrowersByRelationship,
      topBorrowersByLoanCount,
    };
  }

  /**
   * Calculate client account metrics
   */
  private calculateClientAccountMetrics(clientAccounts: ClientBorrowerAccount[]) {
    const accountsWithLoans = clientAccounts.filter(a => 
      a.loans && a.loans.length > 0
    ).length;
    
    const accountsWithoutLoans = clientAccounts.length - accountsWithLoans;
    
    const accountsByType: Record<string, number> = {};
    clientAccounts.forEach(account => {
      const type = account.borrowerType || 'unknown';
      accountsByType[type] = (accountsByType[type] || 0) + 1;
    });

    const totalLoansAcrossAccounts = clientAccounts.reduce(
      (sum, a) => sum + (a.loans?.length || 0), 0
    );

    const averageLoansPerAccount = clientAccounts.length > 0
      ? totalLoansAcrossAccounts / clientAccounts.length
      : 0;

    // Top accounts by loan count
    const topAccountsByLoanCount = clientAccounts
      .filter(a => a.loans && a.loans.length > 0)
      .map(a => ({
        accountId: a.id,
        accountNumber: a.accountNumber,
        borrowerName: a.borrowerNames || a.institutionName || 'Unknown',
        borrowerType: a.borrowerType || 'unknown',
        loanCount: a.loans?.length || 0,
        totalDisbursed: a.loans?.reduce((sum, l) => sum + (l.disbursedAmount || 0), 0) || 0,
      }))
      .sort((a, b) => b.loanCount - a.loanCount)
      .slice(0, 10);

    return {
      totalClientAccounts: clientAccounts.length,
      accountsWithLoans,
      accountsWithoutLoans,
      accountsByType,
      averageLoansPerAccount: Math.round(averageLoansPerAccount * 100) / 100,
      totalLoansAcrossAccounts,
      topAccountsByLoanCount,
    };
  }

  /**
   * Calculate loan performance metrics
   */
  private calculateLoanMetrics(
    loans: Loan[],
    recentTransactions: Transaction[],
    asOfDate: Date
  ) {
    // Basic totals
    const totalLoans = loans.length;
    const totalDisbursed = loans.reduce((sum, l) => sum + (l.disbursedAmount || 0), 0);
    const totalOutstandingPrincipal = loans.reduce((sum, l) => sum + (l.outstandingPrincipal || 0), 0);
    const totalAccruedInterest = loans.reduce((sum, l) => sum + (l.accruedInterestToDate || 0), 0);
    const totalOutstandingBalance = totalOutstandingPrincipal + totalAccruedInterest;

    // Status breakdown
    const loansByStatus: Record<string, { count: number; amount: number; percentage: number }> = {};
    const statusCounts: Record<string, number> = {};
    const statusAmounts: Record<string, number> = {};

    loans.forEach(loan => {
      const status = loan.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      statusAmounts[status] = (statusAmounts[status] || 0) + loan.disbursedAmount;
    });

    Object.keys(statusCounts).forEach(status => {
      loansByStatus[status] = {
        count: statusCounts[status],
        amount: Math.round(statusAmounts[status] * 100) / 100,
        percentage: totalLoans > 0 
          ? Math.round((statusCounts[status] / totalLoans) * 100 * 100) / 100
          : 0,
      };
    });

    // Performing vs Non-performing
    const performingStatuses = [LoanStatus.PERFORMING, LoanStatus.DISBURSED];
    const nonPerformingStatuses = [LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL, LoanStatus.LOSS];
    
    const performingLoans = loans.filter(l => performingStatuses.includes(l.status as LoanStatus));
    const nonPerformingLoans = loans.filter(l => nonPerformingStatuses.includes(l.status as LoanStatus));
    
    const performingCount = performingLoans.length;
    const performingAmount = performingLoans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);
    
    const nonPerformingCount = nonPerformingLoans.length;
    const nonPerformingAmount = nonPerformingLoans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);
    
    const nplRatio = totalOutstandingPrincipal > 0
      ? (nonPerformingAmount / totalOutstandingPrincipal) * 100
      : 0;

    // Portfolio at Risk (PAR)
    const loansInArrears = loans.filter(l => l.daysInArrears > 0);
    
    const par30Loans = loans.filter(l => l.daysInArrears >= 30 && l.daysInArrears < 90);
    const par90Loans = loans.filter(l => l.daysInArrears >= 90 && l.daysInArrears < 180);
    const par180Loans = loans.filter(l => l.daysInArrears >= 180);
    
    const par30Amount = par30Loans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);
    const par90Amount = par90Loans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);
    const par180Amount = par180Loans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);

    // Repayment metrics
    const totalPaymentsLast30Days = recentTransactions.reduce(
      (sum, t) => sum + (t.amountPaid || 0), 0
    );
    
    const expectedRepaymentLast30Days = loans.reduce((sum, l) => {
      // Simplified: assume monthly installment is expected payment
      return sum + (l.monthlyInstallmentAmount || 0);
    }, 0);
    
    const collectionRate = expectedRepaymentLast30Days > 0
      ? (totalPaymentsLast30Days / expectedRepaymentLast30Days) * 100
      : 0;

    const loansInArrearsCount = loansInArrears.length;
    const totalArrearsAmount = loansInArrears.reduce(
      (sum, l) => sum + l.outstandingPrincipal + l.accruedInterestToDate, 0
    );
    
    const loansOnSchedule = loans.filter(l => l.daysInArrears === 0 && 
      [LoanStatus.PERFORMING, LoanStatus.DISBURSED].includes(l.status as LoanStatus)
    ).length;

    const averageDaysInArrears = loansInArrearsCount > 0
      ? loansInArrears.reduce((sum, l) => sum + l.daysInArrears, 0) / loansInArrearsCount
      : 0;

    // Provisioning
    const totalProvisionRequired = loans.reduce((sum, l) => sum + (l.calculateProvisionRequired?.() || 0), 0);
    const averageProvisionRate = totalOutstandingPrincipal > 0
      ? (totalProvisionRequired / totalOutstandingPrincipal) * 100
      : 0;

    // Average metrics
    const averageInterestRate = loans.length > 0
      ? loans.reduce((sum, l) => sum + (l.annualInterestRate || 0), 0) / loans.length
      : 0;
    
    const averageLoanTerm = loans.length > 0
      ? loans.reduce((sum, l) => sum + (l.termInMonths || 0), 0) / loans.length
      : 0;
    
    const averageLoanSize = loans.length > 0
      ? totalDisbursed / loans.length
      : 0;

    // Largest loans
    const largestLoans = loans
      .map(l => ({
        loanId: l.loanId,
        borrowerName: l.borrower?.fullName || 'Unknown',
        amount: l.disbursedAmount,
        status: l.status,
        outstandingBalance: l.outstandingPrincipal + l.accruedInterestToDate,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Recent loans
    const recentLoans = loans
      .filter(l => l.disbursementDate)
      .map(l => ({
        loanId: l.loanId,
        borrowerName: l.borrower?.fullName || 'Unknown',
        amount: l.disbursedAmount,
        status: l.status,
        disbursedAt: l.disbursementDate as Date,
      }))
      .sort((a, b) => {
        if (!a.disbursedAt) return 1;
        if (!b.disbursedAt) return -1;
        return b.disbursedAt.getTime() - a.disbursedAt.getTime();
      })
      .slice(0, 10);

    // Loan officer performance (simplified)
    const loanOfficerPerformance = this.calculateLoanOfficerPerformance(loans);

    return {
      totalLoans,
      totalDisbursed: Math.round(totalDisbursed * 100) / 100,
      totalOutstandingPrincipal: Math.round(totalOutstandingPrincipal * 100) / 100,
      totalAccruedInterest: Math.round(totalAccruedInterest * 100) / 100,
      totalOutstandingBalance: Math.round(totalOutstandingBalance * 100) / 100,
      
      loansByStatus,
      
      performingLoans: {
        count: performingCount,
        amount: Math.round(performingAmount * 100) / 100,
        percentage: totalLoans > 0 
          ? Math.round((performingCount / totalLoans) * 100 * 100) / 100
          : 0,
      },
      nonPerformingLoans: {
        count: nonPerformingCount,
        amount: Math.round(nonPerformingAmount * 100) / 100,
        percentage: totalLoans > 0 
          ? Math.round((nonPerformingCount / totalLoans) * 100 * 100) / 100
          : 0,
        nplRatio: Math.round(nplRatio * 100) / 100,
      },
      
      portfolioAtRisk: {
        par30: {
          count: par30Loans.length,
          amount: Math.round(par30Amount * 100) / 100,
          percentage: totalOutstandingPrincipal > 0 
            ? Math.round((par30Amount / totalOutstandingPrincipal) * 100 * 100) / 100
            : 0,
        },
        par90: {
          count: par90Loans.length,
          amount: Math.round(par90Amount * 100) / 100,
          percentage: totalOutstandingPrincipal > 0 
            ? Math.round((par90Amount / totalOutstandingPrincipal) * 100 * 100) / 100
            : 0,
        },
        par180: {
          count: par180Loans.length,
          amount: Math.round(par180Amount * 100) / 100,
          percentage: totalOutstandingPrincipal > 0 
            ? Math.round((par180Amount / totalOutstandingPrincipal) * 100 * 100) / 100
            : 0,
        },
      },
      
      repaymentMetrics: {
        collectionRate: Math.round(collectionRate * 100) / 100,
        averageDaysInArrears: Math.round(averageDaysInArrears * 100) / 100,
        loansInArrears: loansInArrearsCount,
        totalArrearsAmount: Math.round(totalArrearsAmount * 100) / 100,
        loansOnSchedule,
      },
      
      provisioningMetrics: {
        totalProvisionRequired: Math.round(totalProvisionRequired * 100) / 100,
        averageProvisionRate: Math.round(averageProvisionRate * 100) / 100,
      },
      
      averageInterestRate: Math.round(averageInterestRate * 100) / 100,
      averageLoanTerm: Math.round(averageLoanTerm * 100) / 100,
      averageLoanSize: Math.round(averageLoanSize * 100) / 100,
      
      largestLoans,
      recentLoans,
      loanOfficerPerformance,
    };
  }

  /**
   * Calculate loan officer performance metrics
   */
  private calculateLoanOfficerPerformance(loans: Loan[]) {
    // Group loans by loan officer
    const officerMap = new Map<string, {
      officerId: number;
      officerName: string;
      loans: Loan[];
    }>();

    loans.forEach(loan => {
      // Loan officer name might be stored in loanOfficer field
      const officerName = loan.loanOfficer || 'Unassigned';
      
      if (!officerMap.has(officerName)) {
        officerMap.set(officerName, {
          officerId: 0, // We don't have numeric ID from loanOfficer string
          officerName,
          loans: [],
        });
      }
      
      officerMap.get(officerName)!.loans.push(loan);
    });

    const performingStatuses = [LoanStatus.PERFORMING, LoanStatus.DISBURSED];
    
    const result = Array.from(officerMap.values())
      .map(officer => {
        const totalLoans = officer.loans.length;
        const totalDisbursed = officer.loans.reduce((sum, l) => sum + l.disbursedAmount, 0);
        const performingLoans = officer.loans.filter(l => 
          performingStatuses.includes(l.status as LoanStatus)
        ).length;
        const nonPerformingLoans = totalLoans - performingLoans;
        
        const collectionRate = performingLoans > 0
          ? (performingLoans / totalLoans) * 100
          : 0;

        return {
          officerId: officer.officerId,
          officerName: officer.officerName,
          totalLoansManaged: totalLoans,
          totalDisbursed: Math.round(totalDisbursed * 100) / 100,
          performingLoans,
          nonPerformingLoans,
          collectionRate: Math.round(collectionRate * 100) / 100,
        };
      })
      .sort((a, b) => b.collectionRate - a.collectionRate)
      .slice(0, 10);

    return result;
  }

  /**
   * Calculate borrower type loan distribution
   */
  private calculateBorrowerTypeDistribution(loans: Loan[]) {
    const individualLoans = loans.filter(l => l.borrowerType === 'individual');
    const institutionLoans = loans.filter(l => l.borrowerType === 'institution');

    const individualCount = individualLoans.length;
    const individualAmount = individualLoans.reduce((sum, l) => sum + l.disbursedAmount, 0);
    
    const institutionCount = institutionLoans.length;
    const institutionAmount = institutionLoans.reduce((sum, l) => sum + l.disbursedAmount, 0);

    return {
      individual: {
        count: individualCount,
        amount: Math.round(individualAmount * 100) / 100,
        averageLoanSize: individualCount > 0 
          ? Math.round((individualAmount / individualCount) * 100) / 100
          : 0,
      },
      institution: {
        count: institutionCount,
        amount: Math.round(institutionAmount * 100) / 100,
        averageLoanSize: institutionCount > 0 
          ? Math.round((institutionAmount / institutionCount) * 100) / 100
          : 0,
      },
    };
  }

  /**
   * Calculate temporal metrics (monthly trends)
   */
  private calculateTemporalMetrics(loans: Loan[], transactions: Transaction[]) {
    const last12Months: Date[] = [];
    const today = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(today.getMonth() - i);
      last12Months.push(date);
    }

    const loansByMonth: Array<{ month: string; count: number; amount: number }> = [];
    const disbursementsByMonth: Array<{ month: string; amount: number }> = [];
    const repaymentsByMonth: Array<{ month: string; amount: number }> = [];

    last12Months.forEach((date, index) => {
      const monthStr = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      // Loans created this month
      const monthLoans = loans.filter(l => {
        const created = new Date(l.createdAt);
        return created >= monthStart && created <= monthEnd;
      });

      // Disbursements this month
      const monthDisbursements = loans.filter(l => {
        if (!l.disbursementDate) return false;
        const disbursed = new Date(l.disbursementDate);
        return disbursed >= monthStart && disbursed <= monthEnd;
      });

      // Repayments this month
      const monthRepayments = transactions.filter(t => {
        const transDate = new Date(t.createdAt);
        return transDate >= monthStart && transDate <= monthEnd;
      });

      loansByMonth.push({
        month: monthStr,
        count: monthLoans.length,
        amount: Math.round(monthLoans.reduce((sum, l) => sum + l.disbursedAmount, 0) * 100) / 100,
      });

      disbursementsByMonth.push({
        month: monthStr,
        amount: Math.round(monthDisbursements.reduce((sum, l) => sum + l.disbursedAmount, 0) * 100) / 100,
      });

      repaymentsByMonth.push({
        month: monthStr,
        amount: Math.round(monthRepayments.reduce((sum, t) => sum + (t.amountPaid || 0), 0) * 100) / 100,
      });
    });

    return {
      loansByMonth,
      disbursementsByMonth,
      repaymentsByMonth,
    };
  }

  /**
   * Calculate performance scorecard
   */
  private calculatePerformanceScorecard(
    loanMetrics: any,
    borrowerMetrics: any,
    clientAccountMetrics: any
  ) {
    const metrics = [
      {
        name: 'Client Account Coverage',
        value: borrowerMetrics.clientAccountCoverage,
        target: 80,
        status: this.getMetricStatus(borrowerMetrics.clientAccountCoverage, 80),
        score: this.calculateScore(borrowerMetrics.clientAccountCoverage, 80),
      },
      {
        name: 'NPL Ratio',
        value: loanMetrics.nonPerformingLoans.nplRatio,
        target: 5, // Lower is better
        status: this.getMetricStatusInverse(loanMetrics.nonPerformingLoans.nplRatio, 5),
        score: this.calculateScoreInverse(loanMetrics.nonPerformingLoans.nplRatio, 5),
      },
      {
        name: 'Collection Rate',
        value: loanMetrics.repaymentMetrics.collectionRate,
        target: 95,
        status: this.getMetricStatus(loanMetrics.repaymentMetrics.collectionRate, 95),
        score: this.calculateScore(loanMetrics.repaymentMetrics.collectionRate, 95),
      },
      {
        name: 'PAR 30',
        value: loanMetrics.portfolioAtRisk.par30.percentage,
        target: 10, // Lower is better
        status: this.getMetricStatusInverse(loanMetrics.portfolioAtRisk.par30.percentage, 10),
        score: this.calculateScoreInverse(loanMetrics.portfolioAtRisk.par30.percentage, 10),
      },
      {
        name: 'Average Days in Arrears',
        value: loanMetrics.repaymentMetrics.averageDaysInArrears,
        target: 15, // Lower is better
        status: this.getMetricStatusInverse(loanMetrics.repaymentMetrics.averageDaysInArrears, 15),
        score: this.calculateScoreInverse(loanMetrics.repaymentMetrics.averageDaysInArrears, 15),
      },
      {
        name: 'Loans per Account',
        value: clientAccountMetrics.averageLoansPerAccount,
        target: 1.5,
        status: this.getMetricStatus(clientAccountMetrics.averageLoansPerAccount, 1.5),
        score: this.calculateScore(clientAccountMetrics.averageLoansPerAccount, 1.5),
      },
    ];

    const overallScore = Math.round(
      metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length
    );

    return {
      overallScore,
      metrics,
    };
  }

  private getMetricStatus(value: number, target: number): 'excellent' | 'good' | 'fair' | 'poor' {
    const ratio = value / target;
    if (ratio >= 1.2) return 'excellent';
    if (ratio >= 0.9) return 'good';
    if (ratio >= 0.7) return 'fair';
    return 'poor';
  }

  private getMetricStatusInverse(value: number, target: number): 'excellent' | 'good' | 'fair' | 'poor' {
    const ratio = value / target;
    if (ratio <= 0.5) return 'excellent';
    if (ratio <= 0.8) return 'good';
    if (ratio <= 1.2) return 'fair';
    return 'poor';
  }

  private calculateScore(value: number, target: number): number {
    const ratio = value / target;
    if (ratio >= 1.5) return 100;
    if (ratio >= 1.2) return 90;
    if (ratio >= 0.9) return 75;
    if (ratio >= 0.7) return 60;
    if (ratio >= 0.5) return 40;
    return 20;
  }

  private calculateScoreInverse(value: number, target: number): number {
    const ratio = value / target;
    if (ratio <= 0.3) return 100;
    if (ratio <= 0.5) return 90;
    if (ratio <= 0.8) return 75;
    if (ratio <= 1.2) return 60;
    if (ratio <= 2.0) return 40;
    return 20;
  }

  /**
   * Generate organization summary with strengths, weaknesses, and recommendations
   */
  private generateOrganizationSummary(
    orgName: string,
    userMetrics: any,
    borrowerMetrics: any,
    clientAccountMetrics: any,
    loanMetrics: any,
    scorecard: any
  ) {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Analyze client account coverage
    if (borrowerMetrics.clientAccountCoverage >= 80) {
      strengths.push(`Excellent client account coverage (${borrowerMetrics.clientAccountCoverage.toFixed(1)}%)`);
    } else if (borrowerMetrics.clientAccountCoverage < 50) {
      weaknesses.push(`Low client account coverage (${borrowerMetrics.clientAccountCoverage.toFixed(1)}%)`);
      recommendations.push('Increase client account adoption by converting borrowers to account holders');
    }

    // Analyze NPL ratio
    if (loanMetrics.nonPerformingLoans.nplRatio <= 3) {
      strengths.push(`Excellent portfolio quality with NPL ratio of ${loanMetrics.nonPerformingLoans.nplRatio.toFixed(1)}%`);
    } else if (loanMetrics.nonPerformingLoans.nplRatio > 8) {
      weaknesses.push(`High NPL ratio of ${loanMetrics.nonPerformingLoans.nplRatio.toFixed(1)}%`);
      recommendations.push('Implement enhanced collection strategies for non-performing loans');
    }

    // Analyze collection rate
    if (loanMetrics.repaymentMetrics.collectionRate >= 95) {
      strengths.push(`Strong collection rate of ${loanMetrics.repaymentMetrics.collectionRate.toFixed(1)}%`);
    } else if (loanMetrics.repaymentMetrics.collectionRate < 80) {
      weaknesses.push(`Low collection rate of ${loanMetrics.repaymentMetrics.collectionRate.toFixed(1)}%`);
      recommendations.push('Improve collection processes and borrower communication');
    }

    // Analyze PAR
    if (loanMetrics.portfolioAtRisk.par30.percentage <= 5) {
      strengths.push(`Healthy portfolio with PAR30 at ${loanMetrics.portfolioAtRisk.par30.percentage.toFixed(1)}%`);
    } else if (loanMetrics.portfolioAtRisk.par30.percentage > 15) {
      weaknesses.push(`Elevated PAR30 at ${loanMetrics.portfolioAtRisk.par30.percentage.toFixed(1)}%`);
      recommendations.push('Review underwriting criteria for new loans');
    }

    // Analyze borrower base
    if (borrowerMetrics.totalBorrowers > 0) {
      if (borrowerMetrics.individualBorrowers > borrowerMetrics.institutionBorrowers) {
        strengths.push(`Strong individual borrower base (${borrowerMetrics.individualBorrowers} individuals)`);
      }
      
      if (borrowerMetrics.borrowersWithClientAccount > 0 && 
          borrowerMetrics.topBorrowersByLoanCount.length > 0) {
        const topBorrower = borrowerMetrics.topBorrowersByLoanCount[0];
        recommendations.push(`Consider cross-selling to top borrower ${topBorrower.borrowerName}`);
      }
    }

    // Analyze loan officer performance
    if (loanMetrics.loanOfficerPerformance.length > 0) {
      const topOfficer = loanMetrics.loanOfficerPerformance[0];
      strengths.push(`Top performer: ${topOfficer.officerName} with ${topOfficer.collectionRate.toFixed(1)}% collection rate`);
      
      if (loanMetrics.loanOfficerPerformance.length > 1) {
        const bottomOfficer = loanMetrics.loanOfficerPerformance[loanMetrics.loanOfficerPerformance.length - 1];
        if (bottomOfficer.collectionRate < 70) {
          weaknesses.push(`Low performer: ${bottomOfficer.officerName} with ${bottomOfficer.collectionRate.toFixed(1)}% collection rate`);
          recommendations.push(`Provide training to ${bottomOfficer.officerName} on collection techniques`);
        }
      }
    }

    // Determine overall health status
    let healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' = 'fair';
    const overallScore = scorecard.overallScore;
    
    if (overallScore >= 85) healthStatus = 'excellent';
    else if (overallScore >= 70) healthStatus = 'good';
    else if (overallScore >= 50) healthStatus = 'fair';
    else if (overallScore >= 30) healthStatus = 'poor';
    else healthStatus = 'critical';

    // Add default recommendations if none
    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring portfolio performance');
      recommendations.push('Maintain strong client relationships');
      recommendations.push('Review interest rates against market benchmarks');
    }

    return {
      healthStatus,
      keyStrengths: strengths.slice(0, 5),
      keyWeaknesses: weaknesses.slice(0, 5),
      recommendations: recommendations.slice(0, 5),
    };
  }

  /**
   * Calculate summary statistics across all organizations
   */
  private calculateSummaryStatistics(organizations: OrganizationPerformanceMetrics[]) {
    const totalUsers = organizations.reduce((sum, org) => sum + org.userMetrics.totalUsers, 0);
    const totalBorrowers = organizations.reduce((sum, org) => sum + org.borrowerMetrics.totalBorrowers, 0);
    const totalClientAccounts = organizations.reduce((sum, org) => sum + org.clientAccountMetrics.totalClientAccounts, 0);
    const totalLoans = organizations.reduce((sum, org) => sum + org.loanMetrics.totalLoans, 0);
    const totalDisbursed = organizations.reduce((sum, org) => sum + org.loanMetrics.totalDisbursed, 0);
    const totalOutstanding = organizations.reduce((sum, org) => sum + org.loanMetrics.totalOutstandingPrincipal, 0);
    
    const weightedNPL = totalOutstanding > 0
      ? organizations.reduce((sum, org) => {
          const nplAmount = org.loanMetrics.nonPerformingLoans.amount;
          return sum + (nplAmount * org.loanMetrics.totalOutstandingPrincipal);
        }, 0) / totalOutstanding
      : 0;

    // Top performing organizations by score
    const topPerformingOrganizations = organizations
      .map(org => ({
        id: org.organizationId,
        name: org.organizationName,
        score: org.performanceScorecard.overallScore,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Count by health status
    const organizationsByHealth: Record<string, number> = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 0,
    };

    organizations.forEach(org => {
      organizationsByHealth[org.summary.healthStatus] = 
        (organizationsByHealth[org.summary.healthStatus] || 0) + 1;
    });

    return {
      totalUsers,
      totalBorrowers,
      totalClientAccounts,
      totalLoans,
      totalDisbursed: Math.round(totalDisbursed * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      overallNPL: Math.round(weightedNPL * 100) / 100,
      topPerformingOrganizations,
      organizationsByHealth,
    };
  }
}

export default new PerformanceAnalyticsService();