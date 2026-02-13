// @ts-nocheck
import { Request, Response } from "express";
import dbConnection from "../db";
import { Loan, LoanStatus } from "../entities/Loan";
import { RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";
import { LoanDisbursement } from "../entities/LoanDisbursement";

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

class NotificationController {
  /**
   * GET /api/organizations/:organizationId/notifications/summary
   *
   * Returns notification counts for:
   * 1. Pending loan applications (status = 'pending')
   * 2. Pending document requests not yet submitted
   * 3. Loans disbursed TODAY
   * 4. Upcoming installments due in 1–7 days (not yet paid)
   */
  getNotificationSummary = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({ success: false, message: "Invalid organization ID" });
        return;
      }

      const loanRepo         = dbConnection.getRepository(Loan);
      const scheduleRepo     = dbConnection.getRepository(RepaymentSchedule);
      const disbursementRepo = dbConnection.getRepository(LoanDisbursement);

      // ─── 1. Pending Loan Applications ───────────────────────────────────────
      // Uses Loan entity: status: LoanStatus (enum), isActive: boolean
      const pendingLoansCount = await loanRepo
        .createQueryBuilder("loan")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.status = :status", { status: LoanStatus.PENDING })
        .andWhere("loan.isActive = true")
        .getCount();

      // ─── 2. Pending Document Requests ───────────────────────────────────────
      // Loan entity fields used:
      //   hasDocumentRequest: boolean  (column: "hasDocumentRequest")
      //   additionalDocumentRequests: DocumentRequestSummary | null  (jsonb column)
      //
      // DocumentRequestSummary interface has a top-level `status` property:
      //   status: 'pending' | 'completed' | 'partially_completed'
      //
      // IMPORTANT: PostgreSQL requires the exact camelCase column name to be
      // double-quoted in raw SQL, otherwise it gets lowercased and fails.
      const pendingDocRequestsCount = await loanRepo
        .createQueryBuilder("loan")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("loan.isActive = true")
        .andWhere("loan.hasDocumentRequest = true")
        .andWhere(`loan."additionalDocumentRequests"->>'status' = :docStatus`, {
          docStatus: "pending",
        })
        .getCount();

      // ─── 3. Loans Disbursed Today ────────────────────────────────────────────
      // Uses LoanDisbursement entity:
      //   organizationId: number, isActive: boolean, createdAt: Date
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const disbursedTodayCount = await disbursementRepo
        .createQueryBuilder("d")
        .where("d.organizationId = :organizationId", { organizationId })
        .andWhere("d.isActive = true")
        .andWhere("d.createdAt >= :start", { start: todayStart })
        .andWhere("d.createdAt <= :end",   { end: todayEnd })
        .getCount();

      // Grab detail rows for the dropdown preview
      // LoanDisbursement fields: applicationNumber (varchar), netAmountPayable (decimal), createdAt
      const disbursedTodayLoans = await disbursementRepo
        .createQueryBuilder("d")
        .select([
          "d.loanId",
          "d.applicationNumber",
          "d.netAmountPayable",
          "d.createdAt",
        ])
        .where("d.organizationId = :organizationId", { organizationId })
        .andWhere("d.isActive = true")
        .andWhere("d.createdAt >= :start", { start: todayStart })
        .andWhere("d.createdAt <= :end",   { end: todayEnd })
        .orderBy("d.createdAt", "DESC")
        .getMany();

      // ─── 4. Upcoming Installments (due in 1–7 days, not yet paid) ────────────
      // RepaymentSchedule fields used:
      //   isPaid: boolean, status: ScheduleStatus (enum), dueDate: Date
      //   dueTotal: decimal, installmentNumber: int, loanId: int
      // Joined to Loan for organizationId filter.
      const oneDayFromNow = new Date();
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
      oneDayFromNow.setHours(0, 0, 0, 0);

      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      sevenDaysFromNow.setHours(23, 59, 59, 999);

      const upcomingInstallments = await scheduleRepo
        .createQueryBuilder("rs")
        .innerJoin("rs.loan", "loan")
        .select([
          "rs.id",
          "rs.loanId",
          "rs.dueDate",
          "rs.dueTotal",
          "rs.installmentNumber",
          "loan.loanId",
        ])
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("rs.isPaid = false")
        .andWhere("rs.status NOT IN (:...paidStatuses)", {
          paidStatuses: [ScheduleStatus.PAID, ScheduleStatus.WRITTEN_OFF],
        })
        .andWhere("rs.dueDate >= :from", { from: oneDayFromNow })
        .andWhere("rs.dueDate <= :to",   { to: sevenDaysFromNow })
        .orderBy("rs.dueDate", "ASC")
        .getMany();

      const upcomingInstallmentsCount = upcomingInstallments.length;

      // ─── Total badge count ───────────────────────────────────────────────────
      const totalCount =
        pendingLoansCount +
        pendingDocRequestsCount +
        disbursedTodayCount +
        upcomingInstallmentsCount;

      // ─── Notification items for the dropdown ─────────────────────────────────
      const notifications: any[] = [];

      if (pendingLoansCount > 0) {
        notifications.push({
          type:     "pending_loans",
          count:    pendingLoansCount,
          label:    pendingLoansCount === 1
            ? "1 new pending loan application"
            : `${pendingLoansCount} new pending loan applications`,
          href:     "/dashboard/client/loanmanagement/pendingLoan",
          icon:     "CreditCard",
          priority: 1,
        });
      }

      if (pendingDocRequestsCount > 0) {
        notifications.push({
          type:     "pending_documents",
          count:    pendingDocRequestsCount,
          label:    pendingDocRequestsCount === 1
            ? "1 document request awaiting submission"
            : `${pendingDocRequestsCount} document requests awaiting submission`,
          href:     "/dashboard/client/loanmanagement/pendingLoan",
          icon:     "FileText",
          priority: 2,
        });
      }

      if (disbursedTodayCount > 0) {
        notifications.push({
          type:     "disbursed_today",
          count:    disbursedTodayCount,
          label:    disbursedTodayCount === 1
            ? "1 loan disbursed today"
            : `${disbursedTodayCount} loans disbursed today`,
          href:     "/dashboard/client/loanmanagement",
          icon:     "DollarSign",
          priority: 3,
          details:  disbursedTodayLoans.map((d) => ({
            loanId:      d.applicationNumber,   // varchar e.g. "LN17..."
            amount:      d.netAmountPayable,
            disbursedAt: d.createdAt,
          })),
        });
      }

      if (upcomingInstallmentsCount > 0) {
        notifications.push({
          type:     "upcoming_installments",
          count:    upcomingInstallmentsCount,
          label:    upcomingInstallmentsCount === 1
            ? "1 installment due within 7 days"
            : `${upcomingInstallmentsCount} installments due within 7 days`,
          href:     "/dashboard/client/loanmanagement",
          icon:     "Clock",
          priority: 4,
          details:  upcomingInstallments.slice(0, 5).map((rs) => ({
            loanId:            rs.loan?.loanId,        // e.g. "LN17..."
            installmentNumber: rs.installmentNumber,
            dueDate:           rs.dueDate,
            amount:            rs.dueTotal,
          })),
        });
      }

      res.status(200).json({
        success: true,
        data: {
          totalCount,
          pendingLoansCount,
          pendingDocRequestsCount,
          disbursedTodayCount,
          upcomingInstallmentsCount,
          notifications,
        },
      });
    } catch (error: any) {
      console.error("[NotificationController] error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch notification summary",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
}

export default new NotificationController();