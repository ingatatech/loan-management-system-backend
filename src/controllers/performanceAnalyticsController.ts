
import { Request, Response } from "express";
import dbConnection  from "../db";
import { Organization } from "../entities/Organization";
import { User, UserRole } from "../entities/User";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import { Loan, LoanStatus } from "../entities/Loan";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";

/**
 * GET /api/system/performance
 * System-Owner only endpoint returning per-organization performance metrics.
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     generatedAt: ISO string,
 *     platform: { totalOrgs, totalUsers, totalBorrowers, totalBorrowersWithClientAccount, totalLoans, totalDisbursed, totalOutstanding },
 *     organizations: [ OrganizationPerformance[] ]
 *   }
 * }
 */
export const getSystemPerformance = async (req: Request, res: Response) => {
  try {
    const db = dbConnection;

    // ─── 1. Load all active organizations ──────────────────────────────────
    const organizations = await db
      .getRepository(Organization)
      .createQueryBuilder("org")
      .where("org.deletedAt IS NULL")
      .orderBy("org.createdAt", "ASC")
      .getMany();

    if (!organizations.length) {
      return res.json({
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          platform: {
            totalOrgs: 0, totalUsers: 0, totalBorrowers: 0,
            totalBorrowersWithClientAccount: 0, totalLoans: 0,
            totalDisbursed: 0, totalOutstanding: 0,
          },
          organizations: [],
        },
      });
    }

    const orgIds = organizations.map((o) => o.id);

    // ─── 2. Aggregate queries (one query each, grouped by org) ──────────────

    // Users per org  (exclude system_owner)
    const userRows: Array<{ orgId: string; total: string; active: string }> = await db
      .getRepository(User)
      .createQueryBuilder("u")
      .select("u.organizationId", "orgId")
      .addSelect("COUNT(*)", "total")
      .addSelect("SUM(CASE WHEN u.isActive = true THEN 1 ELSE 0 END)", "active")
      .where("u.organizationId IN (:...orgIds)", { orgIds })
      .andWhere("u.role != :sr", { sr: UserRole.SYSTEM_OWNER })
      .groupBy("u.organizationId")
      .getRawMany();

    // Borrower profiles per org
    const borrowerRows: Array<{ orgId: string; total: string; active: string }> = await db
      .getRepository(BorrowerProfile)
      .createQueryBuilder("b")
      .select("b.organizationId", "orgId")
      .addSelect("COUNT(*)", "total")
      .addSelect("SUM(CASE WHEN b.isActive = true THEN 1 ELSE 0 END)", "active")
      .where("b.organizationId IN (:...orgIds)", { orgIds })
      .groupBy("b.organizationId")
      .getRawMany();

    // Borrowers WITH a ClientBorrowerAccount (unique borrowerIds per org from cba table)
    const cbaRows: Array<{ orgId: string; cnt: string }> = await db
      .getRepository(ClientBorrowerAccount)
      .createQueryBuilder("cba")
      .select("cba.organizationId", "orgId")
      .addSelect("COUNT(DISTINCT cba.borrowerId)", "cnt")
      .where("cba.organizationId IN (:...orgIds)", { orgIds })
      .andWhere("cba.isActive = true")
      .groupBy("cba.organizationId")
      .getRawMany();

    // Loan stats per org
    const loanRows: Array<{
      orgId: string; total: string; pending: string; approved: string;
      disbursed: string; performing: string; watch: string; substandard: string;
      doubtful: string; loss: string; completed: string; rejected: string;
      totalDisbursed: string; totalOutstanding: string;
    }> = await db
      .getRepository(Loan)
      .createQueryBuilder("l")
      .select("l.organizationId", "orgId")
      .addSelect("COUNT(*)", "total")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.PENDING}'      THEN 1 ELSE 0 END)`, "pending")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.APPROVED}'     THEN 1 ELSE 0 END)`, "approved")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.DISBURSED}'    THEN 1 ELSE 0 END)`, "disbursed")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.PERFORMING}'   THEN 1 ELSE 0 END)`, "performing")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.WATCH}'        THEN 1 ELSE 0 END)`, "watch")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.SUBSTANDARD}'  THEN 1 ELSE 0 END)`, "substandard")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.DOUBTFUL}'     THEN 1 ELSE 0 END)`, "doubtful")
      .addSelect(`SUM(CASE WHEN l.status = '${LoanStatus.LOSS}'         THEN 1 ELSE 0 END)`, "loss")
      .addSelect(`SUM(CASE WHEN l.status IN ('${LoanStatus.COMPLETED}','${LoanStatus.FULL_REPAID}') THEN 1 ELSE 0 END)`, "completed")
      .addSelect(`SUM(CASE WHEN l.status IN ('${LoanStatus.REJECTED}','${LoanStatus.REJECTED_AND_CLOSED}') THEN 1 ELSE 0 END)`, "rejected")
      .addSelect("COALESCE(SUM(CAST(l.disbursedAmount AS numeric)), 0)", "totalDisbursed")
      .addSelect("COALESCE(SUM(CAST(l.outstandingPrincipal AS numeric)), 0)", "totalOutstanding")
      .where("l.organizationId IN (:...orgIds)", { orgIds })
      .andWhere("l.isActive = true")
      .groupBy("l.organizationId")
      .getRawMany();

    // ─── 3. Build lookup maps ────────────────────────────────────────────────
    const userMap      = new Map(userRows.map(r => [Number(r.orgId), r]));
    const borrowerMap  = new Map(borrowerRows.map(r => [Number(r.orgId), r]));
    const cbaMap       = new Map(cbaRows.map(r => [Number(r.orgId), Number(r.cnt)]));
    const loanMap      = new Map(loanRows.map(r => [Number(r.orgId), r]));

    // ─── 4. Compose per-organization result ─────────────────────────────────
    const orgResults = organizations.map((org) => {
      const u   = userMap.get(org.id);
      const b   = borrowerMap.get(org.id);
      const cba = cbaMap.get(org.id) ?? 0;
      const l   = loanMap.get(org.id);

      const totalUsers      = Number(u?.total  ?? 0);
      const activeUsers     = Number(u?.active ?? 0);
      const totalBorrowers  = Number(b?.total  ?? 0);
      const activeBorrowers = Number(b?.active ?? 0);

      const totalLoans      = Number(l?.total       ?? 0);
      const pending         = Number(l?.pending     ?? 0);
      const approved        = Number(l?.approved    ?? 0);
      const disbursed       = Number(l?.disbursed   ?? 0);
      const performing      = Number(l?.performing  ?? 0);
      const watch           = Number(l?.watch       ?? 0);
      const substandard     = Number(l?.substandard ?? 0);
      const doubtful        = Number(l?.doubtful    ?? 0);
      const loss            = Number(l?.loss        ?? 0);
      const completed       = Number(l?.completed   ?? 0);
      const rejected        = Number(l?.rejected    ?? 0);

      const totalDisbursedAmt  = Number(l?.totalDisbursed  ?? 0);
      const totalOutstandingAmt= Number(l?.totalOutstanding ?? 0);

      // Active loan portfolio (disbursed / performing / watch / substandard / doubtful / loss)
      const activePortfolio = disbursed + performing + watch + substandard + doubtful + loss;
      // Non-performing loans
      const nplCount = substandard + doubtful + loss;
      const nplRatio = activePortfolio > 0
        ? Number(((nplCount / activePortfolio) * 100).toFixed(2))
        : 0;

      // Performance score 0-100: starts at 100, deductions for each risk category
      const performanceScore = Math.max(
        0,
        Math.round(
          100
          - nplRatio * 0.5
          - (watch       / Math.max(totalLoans, 1)) * 100 * 0.1
          - (substandard / Math.max(totalLoans, 1)) * 100 * 0.2
          - (doubtful    / Math.max(totalLoans, 1)) * 100 * 0.3
          - (loss        / Math.max(totalLoans, 1)) * 100 * 0.4
        )
      );

      // Borrower with client account as percentage
      const borrowerWithAccountPct = totalBorrowers > 0
        ? Number(((cba / totalBorrowers) * 100).toFixed(1))
        : 0;

      return {
        id: org.id,
        name: org.name,
        isActive: org.isActive,
        createdAt: org.createdAt,
        registrationNumber: org.registrationNumber,
        businessSector: org.businessSector,
        phone: org.phone,
        email: org.email,
        address: org.address,
        tinNumber: org.tinNumber,

        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          activeRate: totalUsers > 0 ? Number(((activeUsers / totalUsers) * 100).toFixed(1)) : 0,
        },

        borrowers: {
          total: totalBorrowers,
          active: activeBorrowers,
          withClientAccount: cba,
          withoutClientAccount: Math.max(0, totalBorrowers - cba),
          clientAccountAdoptionRate: borrowerWithAccountPct,
        },

        loans: {
          total: totalLoans,
          byStatus: {
            pending, approved, disbursed,
            performing, watch, substandard, doubtful, loss,
            completed, rejected,
          },
          activePortfolio,
          nplCount,
          nplRatio,
          totalDisbursedAmount: totalDisbursedAmt,
          totalOutstandingPrincipal: totalOutstandingAmt,
          averageLoanSize: activePortfolio > 0
            ? Number((totalDisbursedAmt / Math.max(activePortfolio + completed, 1)).toFixed(2))
            : 0,
        },

        performance: {
          score: performanceScore,
          grade:
            performanceScore >= 90 ? "A" :
            performanceScore >= 75 ? "B" :
            performanceScore >= 60 ? "C" :
            performanceScore >= 40 ? "D" : "F",
          label:
            performanceScore >= 90 ? "Excellent" :
            performanceScore >= 75 ? "Good" :
            performanceScore >= 60 ? "Fair" :
            performanceScore >= 40 ? "Poor" : "Critical",
        },
      };
    });

    // ─── 5. Platform-wide aggregates ────────────────────────────────────────
    const platform = {
      totalOrgs:                      orgResults.length,
      activeOrgs:                     orgResults.filter(o => o.isActive).length,
      totalUsers:                     orgResults.reduce((s, o) => s + o.users.total, 0),
      totalBorrowers:                 orgResults.reduce((s, o) => s + o.borrowers.total, 0),
      totalBorrowersWithClientAccount:orgResults.reduce((s, o) => s + o.borrowers.withClientAccount, 0),
      totalLoans:                     orgResults.reduce((s, o) => s + o.loans.total, 0),
      totalActivePortfolio:           orgResults.reduce((s, o) => s + o.loans.activePortfolio, 0),
      totalDisbursed:                 orgResults.reduce((s, o) => s + o.loans.totalDisbursedAmount, 0),
      totalOutstanding:               orgResults.reduce((s, o) => s + o.loans.totalOutstandingPrincipal, 0),
      totalNplLoans:                  orgResults.reduce((s, o) => s + o.loans.nplCount, 0),
      platformNplRatio: (() => {
        const ap = orgResults.reduce((s, o) => s + o.loans.activePortfolio, 0);
        const npl= orgResults.reduce((s, o) => s + o.loans.nplCount, 0);
        return ap > 0 ? Number(((npl / ap) * 100).toFixed(2)) : 0;
      })(),
      averagePerformanceScore: orgResults.length > 0
        ? Number((orgResults.reduce((s, o) => s + o.performance.score, 0) / orgResults.length).toFixed(1))
        : 0,
    };

    return res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        platform,
        organizations: orgResults,
      },
    });
  } catch (err: any) {
    console.error("[SystemPerformance] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate system performance report",
      error: err.message,
    });
  }
};