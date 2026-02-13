
import { Request, Response } from "express";
import dbConnection from "../db";
import { InstallmentPenalty, PenaltyStatus } from "../entities/Installmentpenalty";
import { RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / msPerDay));
}

function recalcAccrued(penalty: InstallmentPenalty, asOf: Date = new Date()): number {
  if (penalty.status !== PenaltyStatus.ACTIVE) return Number(penalty.accruedAmount);
  const days = daysBetween(new Date(penalty.penaltyStartDate), asOf);
  const daily = (Number(penalty.penaltyBase) * Number(penalty.dailyInterestRate)) / 100;
  return parseFloat((daily * days).toFixed(2));
}

// ─── Controller ───────────────────────────────────────────────────────────────

class InstallmentPenaltyController {

  /**
   * POST /organizations/:organizationId/installment-penalties
   *
   * Apply a penalty to a specific overdue installment.
   * Body: { repaymentScheduleId, dailyInterestRate, notes? }
   */
  applyPenalty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const { repaymentScheduleId, dailyInterestRate, notes } = req.body;

      if (!repaymentScheduleId || dailyInterestRate == null) {
        res.status(400).json({ success: false, message: "repaymentScheduleId and dailyInterestRate are required" });
        return;
      }
      if (Number(dailyInterestRate) <= 0 || Number(dailyInterestRate) > 100) {
        res.status(400).json({ success: false, message: "dailyInterestRate must be between 0 and 100" });
        return;
      }

      const penaltyRepo   = dbConnection.getRepository(InstallmentPenalty);
      const scheduleRepo  = dbConnection.getRepository(RepaymentSchedule);

      // Load the installment and its loan
      const schedule = await scheduleRepo
        .createQueryBuilder("rs")
        .innerJoinAndSelect("rs.loan", "loan")
        .where("rs.id = :id", { id: repaymentScheduleId })
        .andWhere("loan.organizationId = :organizationId", { organizationId })
        .andWhere("rs.isPaid = false")
        .getOne();

      if (!schedule) {
        res.status(404).json({ success: false, message: "Installment not found or already paid" });
        return;
      }

      // Check not already penalized (active)
      const existing = await penaltyRepo.findOne({
        where: { repaymentScheduleId: schedule.id, status: PenaltyStatus.ACTIVE },
      });
      if (existing) {
        res.status(409).json({
          success: false,
          message: "An active penalty already exists for this installment",
          data: existing,
        });
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Penalty base = principal + interest due on this installment
      const penaltyBase =
        Number(schedule.duePrincipal ?? 0) + Number(schedule.dueInterest ?? 0);

      // Penalty starts the day after the due date (or today if overdue for long)
      const dueDate = new Date(schedule.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const startDate = new Date(dueDate);
      startDate.setDate(startDate.getDate() + 1);

      const daysOverdue = daysBetween(startDate, today);
      const daily = (penaltyBase * Number(dailyInterestRate)) / 100;
      const accruedAmount = parseFloat((daily * daysOverdue).toFixed(2));

      const penalty = penaltyRepo.create({
        organizationId,
        loanId: schedule.loanId,
        repaymentScheduleId: schedule.id,
        dailyInterestRate: Number(dailyInterestRate),
        penaltyStartDate: startDate,
        penaltyEndDate: null,
        penaltyBase,
        daysOverdue,
        accruedAmount,
        settledAmount: 0,
        status: PenaltyStatus.ACTIVE,
        waiveReason: notes ?? null,
        createdByUserId: req.user?.id ?? null,
        isActive: true,
      });

      const saved = await penaltyRepo.save(penalty);

      // Eager load relations for response
      const full = await penaltyRepo.findOne({
        where: { id: saved.id },
        relations: ["repaymentSchedule", "loan"],
      });

      res.status(201).json({
        success: true,
        message: "Penalty applied successfully",
        data: { ...full, dailyPenaltyAmount: daily, outstandingAmount: accruedAmount },
      });
    } catch (error: any) {
      console.error("[PenaltyController.applyPenalty]", error);
      res.status(500).json({ success: false, message: "Failed to apply penalty", error: error.message });
    }
  };

  /**
   * GET /organizations/:organizationId/installment-penalties
   *
   * List all penalties for the org.
   * Query params: status, loanId, page, limit
   */
  listPenalties = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const { status, loanId, page = "1", limit = "20" } = req.query as Record<string, string>;

      const penaltyRepo = dbConnection.getRepository(InstallmentPenalty);
      const today = new Date();

      const qb = penaltyRepo
        .createQueryBuilder("p")
        .innerJoinAndSelect("p.repaymentSchedule", "rs")
        .innerJoinAndSelect("p.loan", "loan")
        .where("p.organizationId = :organizationId", { organizationId })
        .andWhere("p.isActive = true");

      if (status) qb.andWhere("p.status = :status", { status });
      if (loanId) qb.andWhere("p.loanId = :loanId", { loanId: parseInt(loanId) });

      qb.orderBy("p.createdAt", "DESC");

      const pageNum  = Math.max(1, parseInt(page));
      const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
      qb.skip((pageNum - 1) * pageSize).take(pageSize);

      const [penalties, total] = await qb.getManyAndCount();

      // Recalculate accrued for ACTIVE penalties on-the-fly
      const enriched = penalties.map((p) => {
        const liveAccrued = recalcAccrued(p, today);
        const daily = (Number(p.penaltyBase) * Number(p.dailyInterestRate)) / 100;
        return {
          ...p,
          accruedAmount: liveAccrued,
          daysOverdue: daysBetween(new Date(p.penaltyStartDate), today),
          dailyPenaltyAmount: parseFloat(daily.toFixed(2)),
          outstandingAmount: parseFloat(Math.max(0, liveAccrued - Number(p.settledAmount)).toFixed(2)),
        };
      });

      res.status(200).json({
        success: true,
        data: enriched,
        meta: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error: any) {
      console.error("[PenaltyController.listPenalties]", error);
      res.status(500).json({ success: false, message: "Failed to fetch penalties", error: error.message });
    }
  };

  /**
   * GET /organizations/:organizationId/installment-penalties/:penaltyId
   * Single penalty detail with live accrual.
   */
  getPenalty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const penaltyId      = parseInt(req.params.penaltyId);

      const penaltyRepo = dbConnection.getRepository(InstallmentPenalty);
      const penalty = await penaltyRepo.findOne({
        where: { id: penaltyId, organizationId, isActive: true },
        relations: ["repaymentSchedule", "loan"],
      });

      if (!penalty) {
        res.status(404).json({ success: false, message: "Penalty not found" });
        return;
      }

      const today = new Date();
      const liveAccrued = recalcAccrued(penalty, today);
      const daily = (Number(penalty.penaltyBase) * Number(penalty.dailyInterestRate)) / 100;

      res.status(200).json({
        success: true,
        data: {
          ...penalty,
          accruedAmount: liveAccrued,
          daysOverdue: daysBetween(new Date(penalty.penaltyStartDate), today),
          dailyPenaltyAmount: parseFloat(daily.toFixed(2)),
          outstandingAmount: parseFloat(Math.max(0, liveAccrued - Number(penalty.settledAmount)).toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error("[PenaltyController.getPenalty]", error);
      res.status(500).json({ success: false, message: "Failed to fetch penalty", error: error.message });
    }
  };

  /**
   * PATCH /organizations/:organizationId/installment-penalties/:penaltyId/recalculate
   *
   * Persists the current live accrued amount to the DB.
   * Called by daily cron or manually by an officer.
   */
  recalculatePenalty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const penaltyId      = parseInt(req.params.penaltyId);

      const penaltyRepo = dbConnection.getRepository(InstallmentPenalty);
      const penalty = await penaltyRepo.findOne({
        where: { id: penaltyId, organizationId, status: PenaltyStatus.ACTIVE, isActive: true },
      });

      if (!penalty) {
        res.status(404).json({ success: false, message: "Active penalty not found" });
        return;
      }

      const today = new Date();
      const liveAccrued = recalcAccrued(penalty, today);
      const daysOverdue = daysBetween(new Date(penalty.penaltyStartDate), today);

      penalty.accruedAmount = liveAccrued;
      penalty.daysOverdue   = daysOverdue;
      penalty.updatedByUserId = req.user?.id ?? null;

      await penaltyRepo.save(penalty);

      res.status(200).json({
        success: true,
        message: "Penalty recalculated",
        data: {
          ...penalty,
          dailyPenaltyAmount: parseFloat(((Number(penalty.penaltyBase) * Number(penalty.dailyInterestRate)) / 100).toFixed(2)),
          outstandingAmount: parseFloat(Math.max(0, liveAccrued - Number(penalty.settledAmount)).toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error("[PenaltyController.recalculatePenalty]", error);
      res.status(500).json({ success: false, message: "Failed to recalculate penalty", error: error.message });
    }
  };

  /**
   * PATCH /organizations/:organizationId/installment-penalties/:penaltyId/waive
   *
   * Waive (forgive) a penalty.
   * Body: { reason }
   */
  waivePenalty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const penaltyId      = parseInt(req.params.penaltyId);
      const { reason }     = req.body;

      if (!reason || String(reason).trim().length < 3) {
        res.status(400).json({ success: false, message: "A reason for waiving is required (min 3 chars)" });
        return;
      }

      const penaltyRepo = dbConnection.getRepository(InstallmentPenalty);
      const penalty = await penaltyRepo.findOne({
        where: { id: penaltyId, organizationId, status: PenaltyStatus.ACTIVE, isActive: true },
      });

      if (!penalty) {
        res.status(404).json({ success: false, message: "Active penalty not found" });
        return;
      }

      penalty.status          = PenaltyStatus.WAIVED;
      penalty.waiveReason     = String(reason).trim();
      penalty.penaltyEndDate  = new Date();
      penalty.updatedByUserId = req.user?.id ?? null;

      await penaltyRepo.save(penalty);

      res.status(200).json({ success: true, message: "Penalty waived successfully", data: penalty });
    } catch (error: any) {
      console.error("[PenaltyController.waivePenalty]", error);
      res.status(500).json({ success: false, message: "Failed to waive penalty", error: error.message });
    }
  };

  /**
   * PATCH /organizations/:organizationId/installment-penalties/:penaltyId/settle
   *
   * Mark a penalty as settled (paid).
   * Body: { settledAmount }
   */
  settlePenalty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const penaltyId      = parseInt(req.params.penaltyId);
      const { settledAmount } = req.body;

      if (settledAmount == null || Number(settledAmount) < 0) {
        res.status(400).json({ success: false, message: "settledAmount must be a non-negative number" });
        return;
      }

      const penaltyRepo = dbConnection.getRepository(InstallmentPenalty);
      const penalty = await penaltyRepo.findOne({
        where: { id: penaltyId, organizationId, isActive: true },
      });

      if (!penalty) {
        res.status(404).json({ success: false, message: "Penalty not found" });
        return;
      }

      // Recalc final accrued before settling
      const finalAccrued = recalcAccrued(penalty, new Date());

      penalty.accruedAmount   = finalAccrued;
      penalty.settledAmount   = Number(settledAmount);
      penalty.status          = PenaltyStatus.SETTLED;
      penalty.penaltyEndDate  = new Date();
      penalty.updatedByUserId = req.user?.id ?? null;

      await penaltyRepo.save(penalty);

      res.status(200).json({ success: true, message: "Penalty settled successfully", data: penalty });
    } catch (error: any) {
      console.error("[PenaltyController.settlePenalty]", error);
      res.status(500).json({ success: false, message: "Failed to settle penalty", error: error.message });
    }
  };

  /**
   * GET /organizations/:organizationId/installment-penalties/summary
   *
   * Dashboard-level stats for the penalties module.
   */
  getPenaltySummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const penaltyRepo = dbConnection.getRepository(InstallmentPenalty);
      const today = new Date();

      // Count by status
      const [active, waived, settled] = await Promise.all([
        penaltyRepo.count({ where: { organizationId, status: PenaltyStatus.ACTIVE,  isActive: true } }),
        penaltyRepo.count({ where: { organizationId, status: PenaltyStatus.WAIVED,  isActive: true } }),
        penaltyRepo.count({ where: { organizationId, status: PenaltyStatus.SETTLED, isActive: true } }),
      ]);

      // Total accrued (active only — live calc from DB stored values)
      const activePenalties = await penaltyRepo.find({
        where: { organizationId, status: PenaltyStatus.ACTIVE, isActive: true },
      });

      let totalAccruedActive    = 0;
      let totalOutstandingActive = 0;

      for (const p of activePenalties) {
        const live = recalcAccrued(p, today);
        totalAccruedActive     += live;
        totalOutstandingActive += Math.max(0, live - Number(p.settledAmount));
      }

      // Total ever settled
      const settledResult = await penaltyRepo
        .createQueryBuilder("p")
        .select("SUM(p.settledAmount)", "total")
        .where("p.organizationId = :organizationId", { organizationId })
        .andWhere("p.status = :s", { s: PenaltyStatus.SETTLED })
        .andWhere("p.isActive = true")
        .getRawOne();

      res.status(200).json({
        success: true,
        data: {
          activePenaltiesCount:    active,
          waivedPenaltiesCount:    waived,
          settledPenaltiesCount:   settled,
          totalPenaltiesCount:     active + waived + settled,
          totalAccruedActive:      parseFloat(totalAccruedActive.toFixed(2)),
          totalOutstandingActive:  parseFloat(totalOutstandingActive.toFixed(2)),
          totalSettledAmount:      parseFloat(Number(settledResult?.total ?? 0).toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error("[PenaltyController.getPenaltySummary]", error);
      res.status(500).json({ success: false, message: "Failed to fetch summary", error: error.message });
    }
  };

  /**
   * GET /organizations/:organizationId/installment-penalties/overdue-installments
   *
   * Returns repayment schedules that are overdue and DO NOT yet have an
   * active penalty — so the officer can apply one.
   */
  getOverdueInstallments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const scheduleRepo = dbConnection.getRepository(RepaymentSchedule);
      const penaltyRepo  = dbConnection.getRepository(InstallmentPenalty);

      // All overdue unpaid installments for this org
      const overdue = await scheduleRepo
        .createQueryBuilder("rs")
        .innerJoinAndSelect("rs.loan", "loan")
        .where("loan.organizationId = :organizationId", { organizationId })
        .andWhere("rs.isPaid = false")
        .andWhere("rs.dueDate < :today", { today })
        .andWhere("rs.status NOT IN (:...done)", {
          done: [ScheduleStatus.PAID, ScheduleStatus.WRITTEN_OFF],
        })
        .andWhere("loan.isActive = true")
        .orderBy("rs.dueDate", "ASC")
        .getMany();

      // Filter out those already penalized
      const penalizedIds = await penaltyRepo
        .createQueryBuilder("p")
        .select("p.repaymentScheduleId")
        .where("p.organizationId = :organizationId", { organizationId })
        .andWhere("p.status = :s", { s: PenaltyStatus.ACTIVE })
        .getRawMany();

      const penalizedSet = new Set(penalizedIds.map((r) => r.p_repaymentScheduleId));

      const result = overdue
        .filter((rs) => !penalizedSet.has(rs.id))
        .map((rs) => ({
          ...rs,
          daysOverdue: daysBetween(new Date(rs.dueDate), today),
        }));

      res.status(200).json({ success: true, data: result, total: result.length });
    } catch (error: any) {
      console.error("[PenaltyController.getOverdueInstallments]", error);
      res.status(500).json({ success: false, message: "Failed to fetch overdue installments", error: error.message });
    }
  };
}

export default new InstallmentPenaltyController();