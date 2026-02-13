import { Repository, Between, In, IsNull, Not } from "typeorm";
import { Organization } from "../entities/Organization";
import { User } from "../entities/User";
import { Loan, LoanStatus, BorrowerType } from "../entities/Loan";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import { RepaymentTransaction } from "../entities/RepaymentTransaction";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";
import { Guarantor } from "../entities/Guarantor";
import { LoanCollateral } from "../entities/LoanCollateral";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import dbConnection from "../db";
import {
  subDays,
  subMonths,
  format,
} from "date-fns";

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

export class ReportsService {
  private organizationRepo: Repository<Organization>;
  private userRepo: Repository<User>;
  private loanRepo: Repository<Loan>;
  private borrowerRepo: Repository<BorrowerProfile>;
  private repaymentTransactionRepo: Repository<RepaymentTransaction>;
  private clientAccountRepo: Repository<ClientBorrowerAccount>;
  private guarantorRepo: Repository<Guarantor>;
  private collateralRepo: Repository<LoanCollateral>;
  private repaymentScheduleRepo: Repository<RepaymentSchedule>;

  constructor() {
    this.organizationRepo = dbConnection.getRepository(Organization);
    this.userRepo = dbConnection.getRepository(User);
    this.loanRepo = dbConnection.getRepository(Loan);
    this.borrowerRepo = dbConnection.getRepository(BorrowerProfile);
    this.repaymentTransactionRepo = dbConnection.getRepository(RepaymentTransaction);
    this.clientAccountRepo = dbConnection.getRepository(ClientBorrowerAccount);
    this.guarantorRepo = dbConnection.getRepository(Guarantor);
    this.collateralRepo = dbConnection.getRepository(LoanCollateral);
    this.repaymentScheduleRepo = dbConnection.getRepository(RepaymentSchedule);
  }

  // ==================== SYSTEM REPORTS ====================

  /**
   * Get comprehensive system-wide report
   * All data sourced directly from database entities — no mock/hardcoded values
   */
  async getSystemReport(dateRange?: DateRange): Promise<ServiceResponse> {
    try {
      const { startDate, endDate } = this.normalizeDateRange(dateRange);

      // ── Organizations ──────────────────────────────────────────────────────
      // Organization uses @DeleteDateColumn (deletedAt), so we filter for active ones.
      const allOrganizations = await this.organizationRepo.find({
        where: { deletedAt: IsNull() },
        relations: ["users", "loans", "borrowerProfiles"],
      });

      // ── Users ──────────────────────────────────────────────────────────────
      // User entity has no deletedAt/DeleteDateColumn — filter by isActive only
      const allUsers = await this.userRepo.find({
        relations: ["organization"],
      });

      // ── Loans (within date range) ──────────────────────────────────────────
      const loans = await this.loanRepo.find({
        where: startDate
          ? { createdAt: Between(startDate, endDate) }
          : {},
        relations: [
          "borrower",
          "organization",
          "transactions",
          "guarantors",
          "collaterals",
          "repaymentSchedules",
        ],
      });

      // ── Borrowers ──────────────────────────────────────────────────────────
      // BorrowerProfile has no @DeleteDateColumn; use isActive to determine status
      const allBorrowers = await this.borrowerRepo.find({
        relations: ["organization", "loans"],
      });

      // ── Client Accounts ────────────────────────────────────────────────────
      const clientAccounts = await this.clientAccountRepo.find({
        where: { isActive: true },
        relations: ["borrower"],
      });

      // ── Transactions (within date range) ──────────────────────────────────
      const transactions = await this.repaymentTransactionRepo.find({
        where: startDate
          ? { createdAt: Between(startDate, endDate) }
          : {},
        relations: ["loan"],
      });

      // ── Guarantors ────────────────────────────────────────────────────────
      const guarantors = await this.guarantorRepo.find({
        where: startDate
          ? { createdAt: Between(startDate, endDate) }
          : {},
      });

      // ── Collaterals ───────────────────────────────────────────────────────
      const collaterals = await this.collateralRepo.find({
        where: startDate
          ? { createdAt: Between(startDate, endDate) }
          : {},
      });

      // ── Organization metrics ───────────────────────────────────────────────
      const totalOrganizations = allOrganizations.length;
      const activeOrganizations = allOrganizations.filter((o) => o.isActive).length;

      // ── User metrics ───────────────────────────────────────────────────────
      const totalUsers = allUsers.length;
      const activeUsers = allUsers.filter((u) => u.isActive).length;
      const usersByRole = this.groupBy(allUsers, "role");

      // ── Borrower metrics ───────────────────────────────────────────────────
      const totalBorrowers = allBorrowers.length;
      const activeBorrowers = allBorrowers.filter((b) => b.isActive).length;

      const borrowersWithClientAccounts = allBorrowers.filter((b) =>
        clientAccounts.some((ca) => ca.borrowerId === b.id)
      ).length;

      // ── Loan metrics ───────────────────────────────────────────────────────
      const totalLoans = loans.length;

      const disbursedLoans = loans.filter(
        (l) =>
          l.status !== LoanStatus.PENDING &&
          l.status !== LoanStatus.REJECTED &&
          l.status !== LoanStatus.REJECTED_AND_CLOSED &&
          Number(l.disbursedAmount) > 0
      ).length;

      const performingLoans = loans.filter(
        (l) => l.status === LoanStatus.PERFORMING
      ).length;

      const watchLoans = loans.filter(
        (l) => l.status === LoanStatus.WATCH
      ).length;

      const paidLoans = loans.filter(
        (l) =>
          l.status === LoanStatus.FULL_REPAID ||
          l.status === LoanStatus.COMPLETED
      ).length;

      const activeLoans = loans.filter((l) =>
        [
          LoanStatus.PERFORMING,
          LoanStatus.WATCH,
          LoanStatus.SUBSTANDARD,
          LoanStatus.DOUBTFUL,
          LoanStatus.DISBURSED,
          LoanStatus.APPROVED,
        ].includes(l.status)
      ).length;

      // ── NPL metrics ────────────────────────────────────────────────────────
      const nplLoans = loans.filter((l) =>
        [
          LoanStatus.SUBSTANDARD,
          LoanStatus.DOUBTFUL,
          LoanStatus.LOSS,
        ].includes(l.status)
      );
      const nplCount = nplLoans.length;
      const nplRatio = totalLoans > 0 ? (nplCount / totalLoans) * 100 : 0;
      const nplAmount = nplLoans.reduce(
        (sum, l) => sum + Number(l.outstandingPrincipal || 0),
        0
      );

      // ── Financial metrics ─────────────────────────────────────────────────
      const totalDisbursed = loans.reduce(
        (sum, l) => sum + Number(l.disbursedAmount || 0),
        0
      );
      const totalRepaid = transactions.reduce(
        (sum, t) => sum + Number(t.amountPaid || 0),
        0
      );
      const totalOutstanding = loans.reduce(
        (sum, l) => sum + Number(l.outstandingPrincipal || 0),
        0
      );
      const totalAccruedInterest = loans.reduce(
        (sum, l) => sum + Number(l.accruedInterestToDate || 0),
        0
      );
      const collectionRate =
        totalDisbursed > 0 ? (totalRepaid / totalDisbursed) * 100 : 0;
      const averageLoanSize =
        totalLoans > 0 ? totalDisbursed / totalLoans : 0;

      // ── Guarantor metrics ──────────────────────────────────────────────────
      const totalGuarantors = guarantors.length;
      const averageGuarantorsPerLoan =
        totalLoans > 0 ? totalGuarantors / totalLoans : 0;

      // ── Collateral metrics ─────────────────────────────────────────────────
      const totalCollateralValue = collaterals.reduce(
        (sum, c) => sum + Number(c.collateralValue || 0),
        0
      );
      const averageLoanToValue =
        totalDisbursed > 0 ? (totalCollateralValue / totalDisbursed) * 100 : 0;

      // ── Recent activity (last 30 days) ─────────────────────────────────────
      const thirtyDaysAgo = subDays(new Date(), 30);
      const recentLoans = loans.filter(
        (l) => new Date(l.createdAt) >= thirtyDaysAgo
      ).length;
      const recentBorrowers = allBorrowers.filter(
        (b) => new Date(b.createdAt) >= thirtyDaysAgo
      ).length;
      const recentUsers = allUsers.filter(
        (u) => new Date(u.createdAt) >= thirtyDaysAgo
      ).length;
      const recentTransactions = transactions.filter(
        (t) => new Date(t.createdAt) >= thirtyDaysAgo
      ).length;

      // ── Monthly trends ─────────────────────────────────────────────────────
      const monthlyTrends = this.generateMonthlyTrends(
        loans,
        transactions,
        allBorrowers,
        allUsers
      );

      // ── Top organizations (by disbursed volume) ────────────────────────────
      const topOrganizations = allOrganizations.map((org) => {
        const orgLoans = loans.filter((l) => l.organizationId === org.id);
        const orgBorrowers = allBorrowers.filter(
          (b) => b.organizationId === org.id
        );
        const orgUsers = allUsers.filter((u) => u.organizationId === org.id);
        const orgDisbursed = orgLoans.reduce(
          (sum, l) => sum + Number(l.disbursedAmount || 0),
          0
        );
        return {
          id: org.id,
          name: org.name,
          isActive: org.isActive,
          createdAt: org.createdAt,
          totalUsers: orgUsers.length,
          totalBorrowers: orgBorrowers.length,
          totalLoans: orgLoans.length,
          totalDisbursed: orgDisbursed,
          performanceScore: this.calculateOrganizationPerformanceScore(orgLoans),
        };
      });

      return {
        success: true,
        message: "System report generated successfully",
        data: {
          generatedAt: new Date().toISOString(),
          dateRange: { startDate, endDate },

          summary: {
            organizations: {
              total: totalOrganizations,
              active: activeOrganizations,
              inactive: totalOrganizations - activeOrganizations,
              activeRate:
                totalOrganizations > 0
                  ? (activeOrganizations / totalOrganizations) * 100
                  : 0,
            },
            users: {
              total: totalUsers,
              active: activeUsers,
              inactive: totalUsers - activeUsers,
              activeRate:
                totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0,
              byRole: Object.entries(usersByRole).map(([role, count]) => ({
                role,
                count,
                percentage:
                  totalUsers > 0 ? (count / totalUsers) * 100 : 0,
              })),
            },
            borrowers: {
              total: totalBorrowers,
              active: activeBorrowers,
              inactive: totalBorrowers - activeBorrowers,
              withClientAccounts: borrowersWithClientAccounts,
              withoutClientAccounts:
                totalBorrowers - borrowersWithClientAccounts,
              accountAdoptionRate:
                totalBorrowers > 0
                  ? (borrowersWithClientAccounts / totalBorrowers) * 100
                  : 0,
            },
            loans: {
              total: totalLoans,
              disbursed: disbursedLoans,
              performing: performingLoans,
              watch: watchLoans,
              fullyPaid: paidLoans,
              active: activeLoans,
              npl: {
                count: nplCount,
                ratio: nplRatio,
                amount: nplAmount,
              },
              byStatus: this.getLoanStatusBreakdown(loans),
            },
            financial: {
              totalDisbursed,
              totalRepaid,
              totalOutstanding,
              totalAccruedInterest,
              collectionRate,
              averageLoanSize,
              portfolioAtRisk: {
                par30: this.calculatePAR(loans, 30),
                par60: this.calculatePAR(loans, 60),
                par90: this.calculatePAR(loans, 90),
              },
            },
            collateral: {
              totalCollaterals: collaterals.length,
              totalValue: totalCollateralValue,
              averageLoanToValue,
              averageGuarantorsPerLoan,
            },
          },

          recentActivity: {
            last30Days: {
              newLoans: recentLoans,
              newBorrowers: recentBorrowers,
              newUsers: recentUsers,
              newTransactions: recentTransactions,
            },
          },

          monthlyTrends,

          topOrganizations: topOrganizations.sort(
            (a, b) => b.totalDisbursed - a.totalDisbursed
          ),

          // ── systemHealth: all values from DB, no hardcoded placeholders ──
          systemHealth: {
            totalActiveOrganizations: activeOrganizations,
            totalActiveUsers: activeUsers,
            totalActiveLoans: activeLoans,
            totalOutstandingPortfolio: totalOutstanding,
            lastTransactionAt:
              transactions.length > 0
                ? transactions.sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime()
                  )[0].createdAt
                : null,
            lastLoanCreatedAt:
              loans.length > 0
                ? loans.sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime()
                  )[0].createdAt
                : null,
          },
        },
      };
    } catch (error: any) {
      console.error("Error in getSystemReport:", error);
      return {
        success: false,
        message: "Failed to generate system report",
        error: error.message,
      };
    }
  }

  // ==================== ORGANIZATION REPORT ====================

  /**
   * Get detailed organization report
   * Uses entity relations correctly — no mock data
   */
  async getOrganizationReport(
    organizationId: number,
    dateRange?: DateRange
  ): Promise<ServiceResponse> {
    try {
      const { startDate, endDate } = this.normalizeDateRange(dateRange);

      const organization = await this.organizationRepo.findOne({
        where: { id: organizationId, deletedAt: IsNull() },
        relations: [
          "users",
          "loans",
          "borrowerProfiles",
          "accounts",
          "transactions",
          "individualShareholders",
          "institutionShareholders",
          "boardDirectors",
          "seniorManagement",
          "shareCapitals",
        ],
      });

      if (!organization) {
        return { success: false, message: "Organization not found" };
      }

      // ── Filter loans by date range ─────────────────────────────────────────
      const loans = (organization.loans || []).filter(
        (l) =>
          !startDate ||
          (new Date(l.createdAt) >= startDate &&
            new Date(l.createdAt) <= endDate)
      );

      // ── Filter borrowers by date range ────────────────────────────────────
      const borrowers = (organization.borrowerProfiles || []).filter(
        (b) =>
          !startDate ||
          (new Date(b.createdAt) >= startDate &&
            new Date(b.createdAt) <= endDate)
      );

      const users = organization.users || [];

      // ── Client accounts for this org ───────────────────────────────────────
      const clientAccounts = await this.clientAccountRepo.find({
        where: { organizationId, isActive: true },
      });

      // ── Transactions for this org's loans (within date range) ──────────────
      const loanIds = loans.map((l) => l.id);
      const transactions =
        loanIds.length > 0
          ? await this.repaymentTransactionRepo.find({
              where: {
                loanId: In(loanIds),
                ...(startDate
                  ? { createdAt: Between(startDate, endDate) }
                  : {}),
              },
              relations: ["loan"],
            })
          : [];

      // ── User metrics ───────────────────────────────────────────────────────
      const totalUsers = users.length;
      const activeUsers = users.filter((u) => u.isActive).length;
      const usersByRole = this.groupBy(users, "role");

      // ── Borrower metrics ───────────────────────────────────────────────────
      const totalBorrowers = borrowers.length;
      const activeBorrowers = borrowers.filter((b) => b.isActive).length;
      const borrowersWithAccounts = borrowers.filter((b) =>
        clientAccounts.some((ca) => ca.borrowerId === b.id)
      ).length;

      // ── Loan metrics ───────────────────────────────────────────────────────
      const totalLoans = loans.length;
      const disbursedLoans = loans.filter(
        (l) =>
          l.status !== LoanStatus.PENDING &&
          l.status !== LoanStatus.REJECTED &&
          l.status !== LoanStatus.REJECTED_AND_CLOSED &&
          Number(l.disbursedAmount) > 0
      ).length;
      const performingLoans = loans.filter(
        (l) => l.status === LoanStatus.PERFORMING
      ).length;
      const watchLoans = loans.filter(
        (l) => l.status === LoanStatus.WATCH
      ).length;
      const paidLoans = loans.filter(
        (l) =>
          l.status === LoanStatus.FULL_REPAID ||
          l.status === LoanStatus.COMPLETED
      ).length;
      const pendingLoans = loans.filter(
        (l) => l.status === LoanStatus.PENDING
      ).length;

      // ── NPL ────────────────────────────────────────────────────────────────
      const nplLoans = loans.filter((l) =>
        [
          LoanStatus.SUBSTANDARD,
          LoanStatus.DOUBTFUL,
          LoanStatus.LOSS,
        ].includes(l.status)
      );
      const nplCount = nplLoans.length;
      const nplRatio = totalLoans > 0 ? (nplCount / totalLoans) * 100 : 0;
      const nplAmount = nplLoans.reduce(
        (sum, l) => sum + Number(l.outstandingPrincipal || 0),
        0
      );

      // ── Financial metrics ─────────────────────────────────────────────────
      const totalDisbursed = loans.reduce(
        (sum, l) => sum + Number(l.disbursedAmount || 0),
        0
      );
      const totalRepaid = transactions.reduce(
        (sum, t) => sum + Number(t.amountPaid || 0),
        0
      );
      const totalOutstanding = loans.reduce(
        (sum, l) => sum + Number(l.outstandingPrincipal || 0),
        0
      );
      const collectionRate =
        totalDisbursed > 0 ? (totalRepaid / totalDisbursed) * 100 : 0;
      const averageLoanSize =
        totalLoans > 0 ? totalDisbursed / totalLoans : 0;

      // ── Borrower type breakdown (from Loan.borrowerType) ──────────────────
      const individualBorrowerIds = new Set(
        loans
          .filter((l) => l.borrowerType === BorrowerType.INDIVIDUAL && l.borrowerId)
          .map((l) => l.borrowerId)
      );
      const institutionBorrowerIds = new Set(
        loans
          .filter((l) => l.borrowerType === BorrowerType.INSTITUTION && l.borrowerId)
          .map((l) => l.borrowerId)
      );

      // ── Governance: from entity relations directly ─────────────────────────
      const totalShareholders =
        (organization.individualShareholders?.length || 0) +
        (organization.institutionShareholders?.length || 0);
      const totalShareCapital = organization.getTotalShareCapital();
      const totalBoardDirectors = organization.boardDirectors?.length || 0;
      const totalSeniorManagement = organization.seniorManagement?.length || 0;

      // ── Monthly trends ─────────────────────────────────────────────────────
      const monthlyTrends = this.generateMonthlyTrends(
        loans,
        transactions,
        borrowers,
        users
      );

      // ── Top borrowers by disbursed amount ──────────────────────────────────
      const topBorrowers = this.getTopBorrowersFromData(
        loans,
        borrowers,
        clientAccounts
      );

      return {
        success: true,
        message: "Organization report generated successfully",
        data: {
          generatedAt: new Date().toISOString(),
          organization: {
            id: organization.id,
            name: organization.name,
            tinNumber: organization.tinNumber,
            registrationNumber: organization.registrationNumber,
            businessSector: organization.businessSector,
            isActive: organization.isActive,
            createdAt: organization.createdAt,
            address: organization.address,
            phone: organization.phone,
            email: organization.email,
            website: organization.website,
          },
          dateRange: { startDate, endDate },

          summary: {
            users: {
              total: totalUsers,
              active: activeUsers,
              inactive: totalUsers - activeUsers,
              activeRate:
                totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0,
              byRole: Object.entries(usersByRole).map(([role, count]) => ({
                role,
                count,
                percentage:
                  totalUsers > 0 ? (count / totalUsers) * 100 : 0,
              })),
            },
            borrowers: {
              total: totalBorrowers,
              active: activeBorrowers,
              inactive: totalBorrowers - activeBorrowers,
              withClientAccounts: borrowersWithAccounts,
              withoutClientAccounts: totalBorrowers - borrowersWithAccounts,
              accountAdoptionRate:
                totalBorrowers > 0
                  ? (borrowersWithAccounts / totalBorrowers) * 100
                  : 0,
              byType: {
                individual: individualBorrowerIds.size,
                institution: institutionBorrowerIds.size,
              },
            },
            loans: {
              total: totalLoans,
              disbursed: disbursedLoans,
              performing: performingLoans,
              watch: watchLoans,
              fullyPaid: paidLoans,
              pending: pendingLoans,
              npl: {
                count: nplCount,
                ratio: nplRatio,
                amount: nplAmount,
              },
              byStatus: this.getLoanStatusBreakdown(loans),
            },
            financial: {
              totalDisbursed,
              totalRepaid,
              totalOutstanding,
              collectionRate,
              averageLoanSize,
              portfolioAtRisk: {
                par30: this.calculatePAR(loans, 30),
                par60: this.calculatePAR(loans, 60),
                par90: this.calculatePAR(loans, 90),
              },
            },
            governance: {
              totalShareholders,
              totalShareCapital,
              totalBoardDirectors,
              totalSeniorManagement,
              isValidForLoan: organization.isValidForLoanApplication(),
            },
          },

          monthlyTrends,
          topBorrowers,

          recentLoans: loans
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
            .slice(0, 10)
            .map((l) => ({
              id: l.id,
              loanId: l.loanId,
              borrowerName: l.borrower?.fullName || "Unknown",
              amount: l.disbursedAmount,
              status: l.status,
              daysInArrears: l.daysInArrears,
              createdAt: l.createdAt,
            })),
        },
      };
    } catch (error: any) {
      console.error("Error in getOrganizationReport:", error);
      return {
        success: false,
        message: "Failed to generate organization report",
        error: error.message,
      };
    }
  }

  // ==================== ALL ORGANIZATIONS REPORT ====================

  /**
   * Get all organizations report (summary for system owner)
   */
  async getAllOrganizationsReport(dateRange?: DateRange): Promise<ServiceResponse> {
    try {
      const { startDate, endDate } = this.normalizeDateRange(dateRange);

      const organizations = await this.organizationRepo.find({
        where: { deletedAt: IsNull() },
        relations: ["users", "loans", "borrowerProfiles"],
      });

      const organizationsData = organizations.map((org) => {
        const orgLoans = (org.loans || []).filter(
          (l) =>
            !startDate ||
            (new Date(l.createdAt) >= startDate &&
              new Date(l.createdAt) <= endDate)
        );
        const orgBorrowers = (org.borrowerProfiles || []).filter(
          (b) =>
            !startDate ||
            (new Date(b.createdAt) >= startDate &&
              new Date(b.createdAt) <= endDate)
        );
        const orgUsers = org.users || [];

        const totalDisbursed = orgLoans.reduce(
          (sum, l) => sum + Number(l.disbursedAmount || 0),
          0
        );
        const totalOutstanding = orgLoans.reduce(
          (sum, l) => sum + Number(l.outstandingPrincipal || 0),
          0
        );
        const performingLoans = orgLoans.filter(
          (l) => l.status === LoanStatus.PERFORMING
        ).length;
        const nplLoansCount = orgLoans.filter((l) =>
          [
            LoanStatus.SUBSTANDARD,
            LoanStatus.DOUBTFUL,
            LoanStatus.LOSS,
          ].includes(l.status)
        ).length;

        return {
          id: org.id,
          name: org.name,
          tinNumber: org.tinNumber,
          businessSector: org.businessSector,
          isActive: org.isActive,
          registeredAt: org.createdAt,
          metrics: {
            totalUsers: orgUsers.length,
            totalBorrowers: orgBorrowers.length,
            totalLoans: orgLoans.length,
            totalDisbursed,
            totalOutstanding,
            performingLoans,
            nplLoans: nplLoansCount,
            nplRatio:
              orgLoans.length > 0
                ? (nplLoansCount / orgLoans.length) * 100
                : 0,
            performanceScore:
              this.calculateOrganizationPerformanceScore(orgLoans),
          },
        };
      });

      const totalOrganizations = organizationsData.length;
      const activeOrganizations = organizationsData.filter(
        (o) => o.isActive
      ).length;
      const totalLoans = organizationsData.reduce(
        (sum, o) => sum + o.metrics.totalLoans,
        0
      );
      const totalDisbursed = organizationsData.reduce(
        (sum, o) => sum + o.metrics.totalDisbursed,
        0
      );
      const totalOutstanding = organizationsData.reduce(
        (sum, o) => sum + o.metrics.totalOutstanding,
        0
      );
      const totalNpl = organizationsData.reduce(
        (sum, o) => sum + o.metrics.nplLoans,
        0
      );

      return {
        success: true,
        message: "Organizations report generated successfully",
        data: {
          generatedAt: new Date().toISOString(),
          dateRange: { startDate, endDate },

          summary: {
            totalOrganizations,
            activeOrganizations,
            inactiveOrganizations: totalOrganizations - activeOrganizations,
            totalLoans,
            totalDisbursed,
            totalOutstanding,
            totalNpl,
            averageNplRatio:
              totalLoans > 0 ? (totalNpl / totalLoans) * 100 : 0,
            organizationsWithLoans: organizationsData.filter(
              (o) => o.metrics.totalLoans > 0
            ).length,
            topPerforming: organizationsData.filter(
              (o) => o.metrics.performanceScore >= 80
            ).length,
            atRisk: organizationsData.filter(
              (o) => o.metrics.nplRatio > 10
            ).length,
          },

          organizations: organizationsData.sort(
            (a, b) => b.metrics.totalDisbursed - a.metrics.totalDisbursed
          ),

          distribution: {
            bySector: this.groupBy(organizationsData, "businessSector" as any),
            bySize: {
              small: organizationsData.filter(
                (o) => o.metrics.totalLoans < 50
              ).length,
              medium: organizationsData.filter(
                (o) =>
                  o.metrics.totalLoans >= 50 && o.metrics.totalLoans < 200
              ).length,
              large: organizationsData.filter(
                (o) => o.metrics.totalLoans >= 200
              ).length,
            },
            byPerformance: {
              excellent: organizationsData.filter(
                (o) => o.metrics.performanceScore >= 90
              ).length,
              good: organizationsData.filter(
                (o) =>
                  o.metrics.performanceScore >= 75 &&
                  o.metrics.performanceScore < 90
              ).length,
              fair: organizationsData.filter(
                (o) =>
                  o.metrics.performanceScore >= 60 &&
                  o.metrics.performanceScore < 75
              ).length,
              poor: organizationsData.filter(
                (o) => o.metrics.performanceScore < 60
              ).length,
            },
          },
        },
      };
    } catch (error: any) {
      console.error("Error in getAllOrganizationsReport:", error);
      return {
        success: false,
        message: "Failed to generate organizations report",
        error: error.message,
      };
    }
  }

  // ==================== BORROWER REPORT ====================

  /**
   * Get borrower report
   * BorrowerProfile has no DeleteDateColumn — do NOT use deletedAt filter
   */
  async getBorrowerReport(
    organizationId?: number,
    dateRange?: DateRange
  ): Promise<ServiceResponse> {
    try {
      const { startDate, endDate } = this.normalizeDateRange(dateRange);

      // Build where clause — no deletedAt on BorrowerProfile
      const whereClause: any = {};
      if (organizationId) whereClause.organizationId = organizationId;
      if (startDate) whereClause.createdAt = Between(startDate, endDate);

      const borrowers = await this.borrowerRepo.find({
        where: whereClause,
        relations: ["organization", "loans"],
      });

      const clientAccounts = await this.clientAccountRepo.find({
        where: organizationId ? { organizationId } : {},
      });

      const borrowerData = borrowers.map((borrower) => {
        const borrowerLoans = borrower.loans || [];
        const hasClientAccount = clientAccounts.some(
          (ca) => ca.borrowerId === borrower.id
        );

        const totalLoans = borrowerLoans.length;
        const totalDisbursed = borrowerLoans.reduce(
          (sum, l) => sum + Number(l.disbursedAmount || 0),
          0
        );
        const totalOutstanding = borrowerLoans.reduce(
          (sum, l) => sum + Number(l.outstandingPrincipal || 0),
          0
        );
        const performingLoans = borrowerLoans.filter(
          (l) => l.status === LoanStatus.PERFORMING
        ).length;
        const completedLoans = borrowerLoans.filter(
          (l) =>
            l.status === LoanStatus.FULL_REPAID ||
            l.status === LoanStatus.COMPLETED
        ).length;

        return {
          id: borrower.id,
          borrowerId: borrower.borrowerId,
          fullName: borrower.fullName,
          nationalId: borrower.nationalId,
          gender: borrower.gender,
          maritalStatus: borrower.maritalStatus,
          primaryPhone: borrower.primaryPhone,
          email: borrower.email,
          address: borrower.address,
          isActive: borrower.isActive,
          createdAt: borrower.createdAt,
          organization: borrower.organization?.name || null,
          metrics: {
            hasClientAccount,
            totalLoans,
            totalDisbursed,
            totalOutstanding,
            performingLoans,
            completedLoans,
            averageLoanSize:
              totalLoans > 0 ? totalDisbursed / totalLoans : 0,
            creditScore: borrower.getCreditScore(),
            isEligible: borrower.isEligibleForLoan(),
          },
        };
      });

      const totalBorrowers = borrowerData.length;
      const activeBorrowers = borrowerData.filter((b) => b.isActive).length;
      const borrowersWithAccounts = borrowerData.filter(
        (b) => b.metrics.hasClientAccount
      ).length;
      const borrowersWithLoans = borrowerData.filter(
        (b) => b.metrics.totalLoans > 0
      ).length;

      return {
        success: true,
        message: "Borrower report generated successfully",
        data: {
          generatedAt: new Date().toISOString(),
          dateRange: { startDate, endDate },

          summary: {
            totalBorrowers,
            activeBorrowers,
            inactiveBorrowers: totalBorrowers - activeBorrowers,
            borrowersWithAccounts,
            borrowersWithoutAccounts:
              totalBorrowers - borrowersWithAccounts,
            accountAdoptionRate:
              totalBorrowers > 0
                ? (borrowersWithAccounts / totalBorrowers) * 100
                : 0,
            borrowersWithLoans,
            borrowersWithoutLoans: totalBorrowers - borrowersWithLoans,
            averageCreditScore:
              totalBorrowers > 0
                ? borrowerData.reduce(
                    (sum, b) => sum + b.metrics.creditScore,
                    0
                  ) / totalBorrowers
                : 0,
          },

          borrowers: borrowerData.sort(
            (a, b) => b.metrics.totalDisbursed - a.metrics.totalDisbursed
          ),

          distribution: {
            byGender: this.groupBy(borrowerData, "gender" as any),
            byMaritalStatus: this.groupBy(
              borrowerData,
              "maritalStatus" as any
            ),
            byLoanActivity: {
              active: borrowerData.filter(
                (b) =>
                  b.metrics.totalLoans > 0 && b.metrics.totalOutstanding > 0
              ).length,
              completed: borrowerData.filter(
                (b) =>
                  b.metrics.completedLoans > 0 &&
                  b.metrics.totalOutstanding === 0
              ).length,
              neverBorrowed: borrowerData.filter(
                (b) => b.metrics.totalLoans === 0
              ).length,
            },
          },
        },
      };
    } catch (error: any) {
      console.error("Error in getBorrowerReport:", error);
      return {
        success: false,
        message: "Failed to generate borrower report",
        error: error.message,
      };
    }
  }

  // ==================== LOAN PORTFOLIO REPORT ====================

  /**
   * Get loan portfolio report — uses actual RepaymentSchedule for arrears,
   * actual RepaymentTransaction for repaid amounts
   */
  async getLoanPortfolioReport(
    organizationId?: number,
    dateRange?: DateRange
  ): Promise<ServiceResponse> {
    try {
      const { startDate, endDate } = this.normalizeDateRange(dateRange);

      const whereClause: any = {};
      if (organizationId) whereClause.organizationId = organizationId;
      if (startDate) whereClause.createdAt = Between(startDate, endDate);

      const loans = await this.loanRepo.find({
        where: whereClause,
        relations: [
          "borrower",
          "organization",
          "transactions",
          "guarantors",
          "collaterals",
          "repaymentSchedules",
        ],
      });

      // ── Portfolio metrics ──────────────────────────────────────────────────
      const totalLoans = loans.length;
      const totalDisbursed = loans.reduce(
        (sum, l) => sum + Number(l.disbursedAmount || 0),
        0
      );
      const totalOutstanding = loans.reduce(
        (sum, l) => sum + Number(l.outstandingPrincipal || 0),
        0
      );

      // totalRepaid: sum from actual transactions linked to these loans
      const totalRepaid = loans.reduce((sum, l) => {
        const loanRepaid = (l.transactions || []).reduce(
          (s, t) => s + Number(t.amountPaid || 0),
          0
        );
        return sum + loanRepaid;
      }, 0);

      const performingLoans = loans.filter(
        (l) => l.status === LoanStatus.PERFORMING
      ).length;
      const watchLoans = loans.filter(
        (l) => l.status === LoanStatus.WATCH
      ).length;
      const substandardLoans = loans.filter(
        (l) => l.status === LoanStatus.SUBSTANDARD
      ).length;
      const doubtfulLoans = loans.filter(
        (l) => l.status === LoanStatus.DOUBTFUL
      ).length;
      const lossLoans = loans.filter(
        (l) => l.status === LoanStatus.LOSS
      ).length;
      const completedLoans = loans.filter(
        (l) =>
          l.status === LoanStatus.FULL_REPAID ||
          l.status === LoanStatus.COMPLETED
      ).length;
      const pendingLoans = loans.filter(
        (l) => l.status === LoanStatus.PENDING
      ).length;
      const approvedLoans = loans.filter(
        (l) => l.status === LoanStatus.APPROVED
      ).length;
      const rejectedLoans = loans.filter(
        (l) =>
          l.status === LoanStatus.REJECTED ||
          l.status === LoanStatus.REJECTED_AND_CLOSED
      ).length;

      const nplLoansCount = substandardLoans + doubtfulLoans + lossLoans;
      const nplRatio =
        totalLoans > 0 ? (nplLoansCount / totalLoans) * 100 : 0;

      // ── PAR metrics ────────────────────────────────────────────────────────
      const par30 = this.calculatePAR(loans, 30);
      const par60 = this.calculatePAR(loans, 60);
      const par90 = this.calculatePAR(loans, 90);

      // ── Loan size distribution (from actual disbursedAmount) ──────────────
      const loanSizeDistribution = {
        micro: loans.filter((l) => Number(l.disbursedAmount) < 100_000).length,
        small: loans.filter(
          (l) =>
            Number(l.disbursedAmount) >= 100_000 &&
            Number(l.disbursedAmount) < 500_000
        ).length,
        medium: loans.filter(
          (l) =>
            Number(l.disbursedAmount) >= 500_000 &&
            Number(l.disbursedAmount) < 1_000_000
        ).length,
        large: loans.filter(
          (l) =>
            Number(l.disbursedAmount) >= 1_000_000 &&
            Number(l.disbursedAmount) < 5_000_000
        ).length,
        enterprise: loans.filter(
          (l) => Number(l.disbursedAmount) >= 5_000_000
        ).length,
      };

      // ── Purpose & sector breakdown from actual entity fields ───────────────
      const purposeBreakdown = this.groupBy(loans, "purposeOfLoan");
      const sectorBreakdown = this.groupBy(loans, "economicSector");
      const borrowerTypeBreakdown = this.groupBy(loans, "borrowerType");

      // ── Repayment performance from daysInArrears field on Loan ────────────
      const onTimePayments = loans.filter(
        (l) => Number(l.daysInArrears) === 0
      ).length;
      const latePayments = loans.filter(
        (l) =>
          Number(l.daysInArrears) > 0 && Number(l.daysInArrears) <= 30
      ).length;
      const defaultPayments = loans.filter(
        (l) => Number(l.daysInArrears) > 30
      ).length;

      // ── Collateral coverage from related collaterals ───────────────────────
      const totalCollateralValue = loans.reduce((sum, l) => {
        const collateralTotal = (l.collaterals || []).reduce(
          (cs, c) => cs + Number(c.collateralValue || 0),
          0
        );
        return sum + collateralTotal;
      }, 0);

      return {
        success: true,
        message: "Loan portfolio report generated successfully",
        data: {
          generatedAt: new Date().toISOString(),
          dateRange: { startDate, endDate },

          summary: {
            totalLoans,
            totalDisbursed,
            totalOutstanding,
            totalRepaid,
            performingLoans,
            watchLoans,
            nplLoans: nplLoansCount,
            nplRatio,
            completedLoans,
            averageLoanSize:
              totalLoans > 0 ? totalDisbursed / totalLoans : 0,
            collectionRate:
              totalDisbursed > 0
                ? (totalRepaid / totalDisbursed) * 100
                : 0,
          },

          portfolioHealth: {
            par30,
            par60,
            par90,
            loanStatus: {
              pending: pendingLoans,
              approved: approvedLoans,
              performing: performingLoans,
              watch: watchLoans,
              substandard: substandardLoans,
              doubtful: doubtfulLoans,
              loss: lossLoans,
              completed: completedLoans,
              rejected: rejectedLoans,
            },
            repaymentPerformance: {
              onTime: onTimePayments,
              late: latePayments,
              default: defaultPayments,
            },
            totalCollateralValue,
            collateralCoverageRatio:
              totalOutstanding > 0
                ? (totalCollateralValue / totalOutstanding) * 100
                : 0,
          },

          distribution: {
            bySize: loanSizeDistribution,
            byBorrowerType: Object.entries(borrowerTypeBreakdown).map(
              ([type, count]) => ({
                type: type || "Not Specified",
                count,
                percentage:
                  totalLoans > 0 ? (count / totalLoans) * 100 : 0,
              })
            ),
            byPurpose: Object.entries(purposeBreakdown).map(
              ([purpose, count]) => ({
                purpose: purpose || "Not Specified",
                count,
                percentage:
                  totalLoans > 0 ? (count / totalLoans) * 100 : 0,
              })
            ),
            bySector: Object.entries(sectorBreakdown).map(
              ([sector, count]) => ({
                sector: sector || "Not Specified",
                count,
                percentage:
                  totalLoans > 0 ? (count / totalLoans) * 100 : 0,
              })
            ),
          },

          recentLoans: loans
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
            .slice(0, 20)
            .map((l) => ({
              id: l.id,
              loanId: l.loanId,
              borrowerName: l.borrower?.fullName || "Unknown",
              amount: l.disbursedAmount,
              status: l.status,
              daysInArrears: l.daysInArrears,
              outstandingPrincipal: l.outstandingPrincipal,
              disbursementDate: l.disbursementDate,
              createdAt: l.createdAt,
            })),
        },
      };
    } catch (error: any) {
      console.error("Error in getLoanPortfolioReport:", error);
      return {
        success: false,
        message: "Failed to generate loan portfolio report",
        error: error.message,
      };
    }
  }

  // ==================== FINANCIAL REPORT ====================

  /**
   * Get financial report
   * Accrued interest, outstanding and all amounts sourced from actual Loan / RepaymentTransaction fields
   */
  async getFinancialReport(
    organizationId?: number,
    dateRange?: DateRange
  ): Promise<ServiceResponse> {
    try {
      const { startDate, endDate } = this.normalizeDateRange(dateRange);

      const loanWhereClause: any = {};
      if (organizationId) loanWhereClause.organizationId = organizationId;
      if (startDate)
        loanWhereClause.disbursementDate = Between(startDate, endDate);

      const loans = await this.loanRepo.find({
        where: loanWhereClause,
        relations: ["transactions", "organization", "repaymentSchedules"],
      });

      const transactionWhereClause: any = {};
      if (startDate)
        transactionWhereClause.createdAt = Between(startDate, endDate);

      // If org-scoped, get only loan IDs for that org
      if (organizationId) {
        const orgLoanIds = loans.map((l) => l.id);
        if (orgLoanIds.length > 0) {
          transactionWhereClause.loanId = In(orgLoanIds);
        } else {
          // No loans for this org → no transactions
          return {
            success: true,
            message: "Financial report generated successfully",
            data: this.emptyFinancialReport(startDate, endDate),
          };
        }
      }

      const transactions = await this.repaymentTransactionRepo.find({
        where:
          Object.keys(transactionWhereClause).length > 0
            ? transactionWhereClause
            : startDate
            ? { createdAt: Between(startDate, endDate) }
            : {},
        relations: ["loan"],
      });

      // ── Financial calculations (all from entity fields) ────────────────────
      const totalDisbursed = loans.reduce(
        (sum, l) => sum + Number(l.disbursedAmount || 0),
        0
      );
      const totalCollected = transactions.reduce(
        (sum, t) => sum + Number(t.amountPaid || 0),
        0
      );
      const totalPrincipalCollected = transactions.reduce(
        (sum, t) => sum + Number(t.principalPaid || 0),
        0
      );
      const totalInterestCollected = transactions.reduce(
        (sum, t) => sum + Number(t.interestPaid || 0),
        0
      );
      const totalOutstanding = loans.reduce(
        (sum, l) => sum + Number(l.outstandingPrincipal || 0),
        0
      );
      const totalAccruedInterest = loans.reduce(
        (sum, l) => sum + Number(l.accruedInterestToDate || 0),
        0
      );

      // expectedInterest: from totalInterestAmount set during loan approval
      const expectedInterest = loans.reduce(
        (sum, l) => sum + Number(l.totalInterestAmount || 0),
        0
      );
      const interestCollectedRate =
        expectedInterest > 0
          ? (totalInterestCollected / expectedInterest) * 100
          : 0;

      // ── Provision for losses from entity method ────────────────────────────
      const provisionForLosses = this.calculateProvisionForLosses(loans);

      // ── Monthly financial breakdown ────────────────────────────────────────
      const monthlyBreakdown = this.generateMonthlyFinancialBreakdown(
        loans,
        transactions,
        startDate,
        endDate
      );

      // ── Income statement (interest income is the primary revenue) ─────────
      const incomeStatement = {
        revenue: {
          interestIncome: totalInterestCollected,
          totalRevenue: totalInterestCollected,
        },
        expenses: {
          provisionForLosses,
          totalExpenses: provisionForLosses,
        },
        netIncome: totalInterestCollected - provisionForLosses,
      };

      // ── Balance sheet (from actual entity fields) ──────────────────────────
      const balanceSheet = {
        assets: {
          loanPortfolio: totalOutstanding,
          accruedInterest: totalAccruedInterest,
          totalAssets: totalOutstanding + totalAccruedInterest,
        },
        liabilities: {
          totalLiabilities: 0, // Borrowings not in scope of this repo fetch
        },
        equity: {
          retainedEarnings: incomeStatement.netIncome,
          totalEquity: incomeStatement.netIncome,
        },
      };

      return {
        success: true,
        message: "Financial report generated successfully",
        data: {
          generatedAt: new Date().toISOString(),
          dateRange: { startDate, endDate },

          summary: {
            totalDisbursed,
            totalCollected,
            totalPrincipalCollected,
            totalInterestCollected,
            totalOutstanding,
            totalAccruedInterest,
            expectedInterest,
            collectionRate:
              totalDisbursed > 0
                ? (totalCollected / totalDisbursed) * 100
                : 0,
            interestCollectedRate,
            provisionForLosses,
          },

          incomeStatement,
          balanceSheet,
          monthlyBreakdown,

          keyRatios: {
            portfolioYield:
              totalOutstanding > 0
                ? (totalInterestCollected / totalOutstanding) * 100
                : 0,
            returnOnAssets:
              balanceSheet.assets.totalAssets > 0
                ? (incomeStatement.netIncome /
                    balanceSheet.assets.totalAssets) *
                  100
                : 0,
            nplCoverage:
              this.calculateProvisionForLosses(
                loans.filter((l) =>
                  [
                    LoanStatus.SUBSTANDARD,
                    LoanStatus.DOUBTFUL,
                    LoanStatus.LOSS,
                  ].includes(l.status)
                )
              ) /
                Math.max(
                  1,
                  loans
                    .filter((l) =>
                      [
                        LoanStatus.SUBSTANDARD,
                        LoanStatus.DOUBTFUL,
                        LoanStatus.LOSS,
                      ].includes(l.status)
                    )
                    .reduce(
                      (sum, l) =>
                        sum + Number(l.outstandingPrincipal || 0),
                      0
                    )
                ) * 100,
          },
        },
      };
    } catch (error: any) {
      console.error("Error in getFinancialReport:", error);
      return {
        success: false,
        message: "Failed to generate financial report",
        error: error.message,
      };
    }
  }

  // ==================== CUSTOM REPORT ====================

  /**
   * Get custom report based on specified metrics
   */
  async getCustomReport(params: {
    metrics: string[];
    dimensions: string[];
    filters: Record<string, any>;
    dateRange?: DateRange;
  }): Promise<ServiceResponse> {
    try {
      const { metrics, dimensions, filters, dateRange } = params;
      const { startDate, endDate } = this.normalizeDateRange(dateRange);

      const result: Record<string, any> = {
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        metrics: {},
        dimensions: {},
      };

      if (
        metrics.includes("loans") ||
        dimensions.includes("loans") ||
        dimensions.includes("byOrganization")
      ) {
        const loanWhere: any = {};
        if (filters.organizationId)
          loanWhere.organizationId = filters.organizationId;
        if (filters.status) loanWhere.status = filters.status;
        if (startDate) loanWhere.createdAt = Between(startDate, endDate);

        const loans = await this.loanRepo.find({
          where: loanWhere,
          relations: ["borrower", "organization"],
        });

        result.metrics.loans = {
          total: loans.length,
          disbursed: loans.reduce(
            (sum, l) => sum + Number(l.disbursedAmount || 0),
            0
          ),
          outstanding: loans.reduce(
            (sum, l) => sum + Number(l.outstandingPrincipal || 0),
            0
          ),
          byStatus: this.getLoanStatusBreakdown(loans),
        };

        if (dimensions.includes("byOrganization")) {
          result.dimensions.byOrganization = this.groupBy(
            loans,
            "organizationId"
          );
        }
      }

      if (
        metrics.includes("borrowers") ||
        dimensions.includes("borrowers")
      ) {
        const borrowerWhere: any = {};
        if (filters.organizationId)
          borrowerWhere.organizationId = filters.organizationId;
        if (startDate)
          borrowerWhere.createdAt = Between(startDate, endDate);

        const borrowers = await this.borrowerRepo.find({
          where: borrowerWhere,
          relations: ["organization"],
        });

        result.metrics.borrowers = {
          total: borrowers.length,
          active: borrowers.filter((b) => b.isActive).length,
          byGender: this.groupBy(borrowers, "gender"),
          byMaritalStatus: this.groupBy(borrowers, "maritalStatus"),
        };
      }

      if (metrics.includes("users") || dimensions.includes("users")) {
        const userWhere: any = {};
        if (filters.organizationId)
          userWhere.organizationId = filters.organizationId;
        if (startDate) userWhere.createdAt = Between(startDate, endDate);

        const users = await this.userRepo.find({
          where: userWhere,
          relations: ["organization"],
        });

        result.metrics.users = {
          total: users.length,
          active: users.filter((u) => u.isActive).length,
          byRole: this.groupBy(users, "role"),
        };
      }

      if (
        metrics.includes("transactions") ||
        dimensions.includes("transactions")
      ) {
        const transactionWhere: any = {};
        if (filters.loanId) transactionWhere.loanId = filters.loanId;
        if (startDate)
          transactionWhere.createdAt = Between(startDate, endDate);

        const transactions = await this.repaymentTransactionRepo.find({
          where: transactionWhere,
          relations: ["loan"],
        });

        result.metrics.transactions = {
          total: transactions.length,
          amount: transactions.reduce(
            (sum, t) => sum + Number(t.amountPaid || 0),
            0
          ),
          principalCollected: transactions.reduce(
            (sum, t) => sum + Number(t.principalPaid || 0),
            0
          ),
          interestCollected: transactions.reduce(
            (sum, t) => sum + Number(t.interestPaid || 0),
            0
          ),
          averageAmount:
            transactions.length > 0
              ? transactions.reduce(
                  (sum, t) => sum + Number(t.amountPaid || 0),
                  0
                ) / transactions.length
              : 0,
        };
      }

      return {
        success: true,
        message: "Custom report generated successfully",
        data: result,
      };
    } catch (error: any) {
      console.error("Error in getCustomReport:", error);
      return {
        success: false,
        message: "Failed to generate custom report",
        error: error.message,
      };
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private normalizeDateRange(dateRange?: DateRange): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    return {
      startDate: dateRange?.startDate || subMonths(now, 12),
      endDate: dateRange?.endDate || now,
    };
  }

  /**
   * Generic groupBy that counts items by a given key.
   * Returns Record<string, number>.
   */
  private groupBy<T>(
    items: T[],
    key: keyof T
  ): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = String(item[key] ?? "unspecified");
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Returns an array of { status, count, amount, percentage } from actual loans.
   * Uses every LoanStatus value present in the dataset.
   */
  private getLoanStatusBreakdown(
    loans: Loan[]
  ): Array<{
    status: string;
    count: number;
    amount: number;
    percentage: number;
  }> {
    const breakdown: Record<string, { count: number; amount: number }> = {};

    loans.forEach((loan) => {
      const status = loan.status;
      if (!breakdown[status]) {
        breakdown[status] = { count: 0, amount: 0 };
      }
      breakdown[status].count += 1;
      breakdown[status].amount += Number(loan.disbursedAmount || 0);
    });

    return Object.entries(breakdown).map(([status, data]) => ({
      status,
      count: data.count,
      amount: data.amount,
      percentage: loans.length > 0 ? (data.count / loans.length) * 100 : 0,
    }));
  }

  /**
   * Portfolio At Risk: ratio of outstanding principal on loans overdue ≥ `days`
   * to total outstanding principal. Uses daysInArrears stored on Loan entity.
   */
  private calculatePAR(loans: Loan[], days: number): number {
    const parLoans = loans.filter(
      (l) => Number(l.daysInArrears) >= days
    );
    const parAmount = parLoans.reduce(
      (sum, l) => sum + Number(l.outstandingPrincipal || 0),
      0
    );
    const totalOutstanding = loans.reduce(
      (sum, l) => sum + Number(l.outstandingPrincipal || 0),
      0
    );
    return totalOutstanding > 0 ? (parAmount / totalOutstanding) * 100 : 0;
  }

  /**
   * Score based on % of performing loans minus NPL penalty.
   * All inputs come from actual Loan.status values.
   */
  private calculateOrganizationPerformanceScore(loans: Loan[]): number {
    if (loans.length === 0) return 0;
    const performing = loans.filter(
      (l) => l.status === LoanStatus.PERFORMING
    ).length;
    const npl = loans.filter((l) =>
      [
        LoanStatus.SUBSTANDARD,
        LoanStatus.DOUBTFUL,
        LoanStatus.LOSS,
      ].includes(l.status)
    ).length;
    const performanceRate = (performing / loans.length) * 100;
    const nplPenalty = (npl / loans.length) * 50;
    return Math.max(0, Math.min(100, performanceRate - nplPenalty));
  }

  /**
   * Provision for losses uses Loan.calculateProvisionRequired() — an entity method
   * that derives the provision from classification and net exposure. No hardcoded values.
   */
  private calculateProvisionForLosses(loans: Loan[]): number {
    return loans.reduce((sum, loan) => {
      return sum + loan.calculateProvisionRequired();
    }, 0);
  }

  /**
   * Monthly trends — 12 months rolling window.
   * Counts are derived entirely from entity createdAt timestamps.
   */
  private generateMonthlyTrends(
    loans: Loan[],
    transactions: RepaymentTransaction[],
    borrowers: BorrowerProfile[],
    users: User[]
  ): any[] {
    const months: any[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        1
      );

      const monthLoans = loans.filter(
        (l) =>
          new Date(l.createdAt) >= monthStart &&
          new Date(l.createdAt) < monthEnd
      );
      const monthTransactions = transactions.filter(
        (t) =>
          new Date(t.createdAt) >= monthStart &&
          new Date(t.createdAt) < monthEnd
      );
      const monthBorrowers = borrowers.filter(
        (b) =>
          new Date(b.createdAt) >= monthStart &&
          new Date(b.createdAt) < monthEnd
      );
      const monthUsers = users.filter(
        (u) =>
          new Date(u.createdAt) >= monthStart &&
          new Date(u.createdAt) < monthEnd
      );

      months.push({
        month: format(monthStart, "MMM yyyy"),
        loans: {
          count: monthLoans.length,
          amount: monthLoans.reduce(
            (sum, l) => sum + Number(l.disbursedAmount || 0),
            0
          ),
        },
        repayments: {
          count: monthTransactions.length,
          amount: monthTransactions.reduce(
            (sum, t) => sum + Number(t.amountPaid || 0),
            0
          ),
        },
        newBorrowers: monthBorrowers.length,
        newUsers: monthUsers.length,
        outstandingAtEnd: monthLoans.reduce(
          (sum, l) => sum + Number(l.outstandingPrincipal || 0),
          0
        ),
      });
    }

    return months;
  }

  /**
   * Monthly financial breakdown using actual disbursementDate and transaction createdAt.
   */
  private generateMonthlyFinancialBreakdown(
    loans: Loan[],
    transactions: RepaymentTransaction[],
    startDate?: Date,
    endDate?: Date
  ): any[] {
    const months: any[] = [];
    const now = endDate || new Date();
    const start = startDate || subMonths(now, 11);

    // Normalise to first of each month
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    while (cursor < end) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        1
      );

      const monthLoans = loans.filter((l) => {
        const d = l.disbursementDate
          ? new Date(l.disbursementDate)
          : new Date(l.createdAt);
        return d >= monthStart && d < monthEnd;
      });

      const monthTransactions = transactions.filter(
        (t) =>
          new Date(t.createdAt) >= monthStart &&
          new Date(t.createdAt) < monthEnd
      );

      months.push({
        month: format(monthStart, "MMM yyyy"),
        disbursements: monthLoans.reduce(
          (sum, l) => sum + Number(l.disbursedAmount || 0),
          0
        ),
        newLoans: monthLoans.length,
        collections: monthTransactions.reduce(
          (sum, t) => sum + Number(t.amountPaid || 0),
          0
        ),
        principal: monthTransactions.reduce(
          (sum, t) => sum + Number(t.principalPaid || 0),
          0
        ),
        interest: monthTransactions.reduce(
          (sum, t) => sum + Number(t.interestPaid || 0),
          0
        ),
        transactionCount: monthTransactions.length,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }

  /**
   * Top borrowers by total disbursed amount.
   * Uses in-memory data already loaded — no extra DB call.
   */
  private getTopBorrowersFromData(
    loans: Loan[],
    borrowers: BorrowerProfile[],
    clientAccounts: ClientBorrowerAccount[]
  ): any[] {
    return borrowers
      .map((borrower) => {
        const borrowerLoans = loans.filter(
          (l) => l.borrowerId === borrower.id
        );
        const totalDisbursed = borrowerLoans.reduce(
          (sum, l) => sum + Number(l.disbursedAmount || 0),
          0
        );
        const totalOutstanding = borrowerLoans.reduce(
          (sum, l) => sum + Number(l.outstandingPrincipal || 0),
          0
        );
        const hasAccount = clientAccounts.some(
          (ca) => ca.borrowerId === borrower.id
        );
        return {
          id: borrower.id,
          borrowerId: borrower.borrowerId,
          name: borrower.fullName,
          totalLoans: borrowerLoans.length,
          totalDisbursed,
          totalOutstanding,
          hasAccount,
          isActive: borrower.isActive,
        };
      })
      .filter((b) => b.totalDisbursed > 0)
      .sort((a, b) => b.totalDisbursed - a.totalDisbursed)
      .slice(0, 10);
  }

  /**
   * Returns an empty financial report shape (used when no loans found for org).
   */
  private emptyFinancialReport(startDate: Date, endDate: Date): object {
    return {
      generatedAt: new Date().toISOString(),
      dateRange: { startDate, endDate },
      summary: {
        totalDisbursed: 0,
        totalCollected: 0,
        totalPrincipalCollected: 0,
        totalInterestCollected: 0,
        totalOutstanding: 0,
        totalAccruedInterest: 0,
        expectedInterest: 0,
        collectionRate: 0,
        interestCollectedRate: 0,
        provisionForLosses: 0,
      },
      incomeStatement: {
        revenue: { interestIncome: 0, totalRevenue: 0 },
        expenses: { provisionForLosses: 0, totalExpenses: 0 },
        netIncome: 0,
      },
      balanceSheet: {
        assets: { loanPortfolio: 0, accruedInterest: 0, totalAssets: 0 },
        liabilities: { totalLiabilities: 0 },
        equity: { retainedEarnings: 0, totalEquity: 0 },
      },
      monthlyBreakdown: [],
      keyRatios: {
        portfolioYield: 0,
        returnOnAssets: 0,
        nplCoverage: 0,
      },
    };
  }
}

export default new ReportsService();