// @ts-nocheck

import dbConnection from "../db";
import { ClassificationAutomationService } from "./classificationAutomationService";
import { ClassificationSnapshot } from "../entities/ClassificationSnapshot";
import { Loan, LoanStatus } from "../entities/Loan";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import { LoanClassification, LoanClass } from "../entities/LoanClassification";

export class DailyClassificationUpdateService {
  
  /**
   * ENHANCED MAIN METHOD: Daily classification update with snapshots
   */
  static async runDailyUpdate(): Promise<void> {
    console.log('=== ENHANCED DAILY CLASSIFICATION UPDATE START ===');
    console.log('Timestamp:', new Date().toISOString());

    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const organizations = await queryRunner.manager.query(
        `SELECT DISTINCT "organizationId" FROM loans WHERE "isActive" = true`
      );

      console.log(`Found ${organizations.length} organizations with active loans`);

      for (const org of organizations) {
        const orgId = org.organizationId;
        console.log(`\nProcessing organization ${orgId}...`);

        try {
          // STEP 1: Update delayed days for all schedules
          console.log('Step 1: Updating delayed days...');
          const delayedDaysResult = await this.updateAllDelayedDays(queryRunner, orgId);
          console.log(`✓ Updated ${delayedDaysResult.updatedSchedules} schedules`);

          // STEP 2: Run classification updates
          console.log('Step 2: Running classification updates...');
          const classificationResult = await ClassificationAutomationService.batchUpdateClassifications(
            queryRunner,
            orgId
          );
          console.log(`✓ Updated ${classificationResult.classificationsUpdated} classifications`);

          // STEP 3: Create daily snapshot
          console.log('Step 3: Creating daily snapshot...');
          const snapshotResult = await this.createDailySnapshot(queryRunner, orgId);
          console.log(`✓ Snapshot created with ${snapshotResult.totalLoans} loans`);

          console.log(`Organization ${orgId} processing complete:`, {
            delayedDaysUpdated: delayedDaysResult.updatedSchedules,
            classificationsUpdated: classificationResult.classificationsUpdated,
            snapshotCreated: true
          });

        } catch (error: any) {
          console.error(`Failed to process organization ${orgId}:`, error);
          // Continue with other organizations even if one fails
        }
      }

      await queryRunner.commitTransaction();
      console.log('=== ENHANCED DAILY CLASSIFICATION UPDATE COMPLETED ===');

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Enhanced daily classification update failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * STEP 1: Update delayed days for all unpaid schedules
   */
  private static async updateAllDelayedDays(
    queryRunner: any,
    organizationId: number
  ): Promise<{ updatedSchedules: number; totalDelayedDays: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all unpaid schedules that are overdue
    const schedules = await queryRunner.manager
      .createQueryBuilder(RepaymentSchedule, 'schedule')
      .leftJoin('schedule.loan', 'loan')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('schedule.isPaid = false')
      .andWhere('schedule.dueDate < :today', { today })
      .getMany();

    let updatedSchedules = 0;
    let totalDelayedDays = 0;

    for (const schedule of schedules) {
      const previousDelayedDays = schedule.delayedDays;
      
      // Use the incrementDelayedDays method from the entity
      schedule.incrementDelayedDays();

      // Only save if delayed days changed
      if (schedule.delayedDays !== previousDelayedDays) {
        await queryRunner.manager.save(RepaymentSchedule, schedule);
        updatedSchedules++;
        totalDelayedDays += schedule.delayedDays;
      }
    }

    // Update loan-level days in arrears
    await this.updateLoanDaysInArrears(queryRunner, organizationId);

    return { updatedSchedules, totalDelayedDays };
  }

  /**
   * Update loan-level days in arrears based on maximum delayed days
   */
  private static async updateLoanDaysInArrears(
    queryRunner: any,
    organizationId: number
  ): Promise<void> {
    const loans = await queryRunner.manager.find(Loan, {
      where: { organizationId, isActive: true },
      relations: ['repaymentSchedules']
    });

    for (const loan of loans) {
      const unpaidSchedules = loan.repaymentSchedules?.filter((s: RepaymentSchedule) => !s.isPaid) || [];
      const maxDelayedDays = unpaidSchedules.length > 0
        ? Math.max(...unpaidSchedules.map((s: RepaymentSchedule) => s.delayedDays))
        : 0;

      if (loan.daysInArrears !== maxDelayedDays) {
        await queryRunner.manager.update(Loan, loan.id, {
          daysInArrears: maxDelayedDays,
          updatedAt: new Date()
        });
      }
    }
  }

  /**
   * STEP 3: Create daily snapshot for trending using original formulas
   */
  private static async createDailySnapshot(
    queryRunner: any,
    organizationId: number
  ): Promise<any> {
    const snapshotDate = new Date();
    snapshotDate.setHours(0, 0, 0, 0);

    // Check if snapshot already exists for today
    const existingSnapshot = await queryRunner.manager.findOne(ClassificationSnapshot, {
      where: { organizationId, snapshotDate }
    });

    if (existingSnapshot) {
      console.log('Snapshot already exists for today, skipping...');
      return existingSnapshot;
    }

    // Get all active loans
    const loans = await queryRunner.manager.find(Loan, {
      where: { organizationId, isActive: true },
      relations: ['collaterals', 'repaymentSchedules', 'classifications']
    });

    // Initialize counters using original classification matrix
    const loanCountByClass: any = {
      normal: 0,
      watch: 0,
      substandard: 0,
      doubtful: 0,
      loss: 0
    };

    const outstandingByClass: any = {
      normal: 0,
      watch: 0,
      substandard: 0,
      doubtful: 0,
      loss: 0
    };

    let totalPortfolioValue = 0;
    let totalProvisionsRequired = 0;
    let totalProvisionsHeld = 0;
    let totalCollateralValue = 0;
    let loansWithOverduePayments = 0;
    let totalDaysInArrears = 0;

    // PAR counters using original ranges
    let par1to30 = 0;
    let par31to90 = 0;
    let par90plus = 0;

    for (const loan of loans) {
      const outstanding = loan.outstandingPrincipal;
      totalPortfolioValue += outstanding;
      totalCollateralValue += loan.totalCollateralValue || 0;

      // Classify loan using original classification matrix
      const loanClass = this.mapStatusToLoanClass(loan.status);
      loanCountByClass[loanClass]++;
      outstandingByClass[loanClass] += outstanding;

      // Calculate provisions using original formula: Net Exposure × Provisioning Rate
      const netExposure = Math.max(0, outstanding - (loan.totalCollateralValue || 0));
      const provisionRate = this.getProvisioningRate(loan.status);
      totalProvisionsRequired += netExposure * provisionRate;

      // Get latest classification for provisions held
      const latestClassification = loan.classifications
        ?.sort((a: LoanClassification, b: LoanClassification) => b.classificationDate.getTime() - a.classificationDate.getTime())[0];
      
      if (latestClassification) {
        totalProvisionsHeld += latestClassification.provisionRequired;
      }

      // PAR calculation using original ranges
      const daysOverdue = loan.getMaxDaysOverdue();
      if (daysOverdue > 0) {
        loansWithOverduePayments++;
        totalDaysInArrears += daysOverdue;

        // Original PAR ranges: 1-30, 31-90, 90+
        if (daysOverdue <= 30) {
          par1to30 += outstanding;
        } else if (daysOverdue <= 90) {
          par31to90 += outstanding;
        } else {
          par90plus += outstanding;
        }
      }
    }

    const totalPAR = par1to30 + par31to90 + par90plus;
    const parBreakdown = {
      par1to30: Math.round(par1to30 * 100) / 100,
      par31to90: Math.round(par31to90 * 100) / 100,
      par90plus: Math.round(par90plus * 100) / 100,
      totalPAR: Math.round(totalPAR * 100) / 100
    };

    // Calculate ratios using original formulas
    const totalPARRatio = totalPortfolioValue > 0
      ? Math.round((totalPAR / totalPortfolioValue) * 10000) / 100
      : 0;

    const provisionAdequacyRatio = totalProvisionsRequired > 0
      ? Math.round((totalProvisionsHeld / totalProvisionsRequired) * 10000) / 100
      : 100;

    const collateralCoverageRatio = totalPortfolioValue > 0
      ? Math.round((totalCollateralValue / totalPortfolioValue) * 10000) / 100
      : 0;

    const averageDaysInArrears = loansWithOverduePayments > 0
      ? Math.round((totalDaysInArrears / loansWithOverduePayments) * 100) / 100
      : 0;

    // Create snapshot
    const snapshot = queryRunner.manager.create(ClassificationSnapshot, {
      organizationId,
      snapshotDate,
      totalLoans: loans.length,
      totalActiveLoans: loans.length,
      totalPortfolioValue: Math.round(totalPortfolioValue * 100) / 100,
      loanCountByClass,
      outstandingByClass: {
        normal: Math.round(outstandingByClass.normal * 100) / 100,
        watch: Math.round(outstandingByClass.watch * 100) / 100,
        substandard: Math.round(outstandingByClass.substandard * 100) / 100,
        doubtful: Math.round(outstandingByClass.doubtful * 100) / 100,
        loss: Math.round(outstandingByClass.loss * 100) / 100
      },
      totalProvisionsRequired: Math.round(totalProvisionsRequired * 100) / 100,
      totalProvisionsHeld: Math.round(totalProvisionsHeld * 100) / 100,
      provisionAdequacyRatio,
      parBreakdown,
      totalPARRatio,
      totalCollateralValue: Math.round(totalCollateralValue * 100) / 100,
      collateralCoverageRatio,
      loansWithOverduePayments,
      averageDaysInArrears
    });

    const savedSnapshot = await queryRunner.manager.save(ClassificationSnapshot, snapshot);
    
    return savedSnapshot;
  }

  /**
   * Helper: Map loan status to loan class using original matrix
   */
  private static mapStatusToLoanClass(status: LoanStatus): string {
    const mapping: Record<LoanStatus, string> = {
      [LoanStatus.PERFORMING]: 'normal',
      [LoanStatus.WATCH]: 'watch',
      [LoanStatus.SUBSTANDARD]: 'substandard',
      [LoanStatus.DOUBTFUL]: 'doubtful',
      [LoanStatus.LOSS]: 'loss',
      [LoanStatus.PENDING]: 'normal',
      [LoanStatus.APPROVED]: 'normal',
      [LoanStatus.DISBURSED]: 'normal',
      [LoanStatus.WRITTEN_OFF]: 'loss',
      [LoanStatus.CLOSED]: 'normal'
    };
    return mapping[status];
  }

  /**
   * Helper: Get provisioning rate using original rates
   */
  private static getProvisioningRate(status: LoanStatus): number {
    const rates: Record<LoanStatus, number> = {
      [LoanStatus.PERFORMING]: 0.01,    // 1%
      [LoanStatus.WATCH]: 0.05,         // 5%
      [LoanStatus.SUBSTANDARD]: 0.25,   // 25%
      [LoanStatus.DOUBTFUL]: 0.50,      // 50%
      [LoanStatus.LOSS]: 1.00,          // 100%
      [LoanStatus.PENDING]: 0.01,
      [LoanStatus.APPROVED]: 0.01,
      [LoanStatus.DISBURSED]: 0.01,
      [LoanStatus.WRITTEN_OFF]: 1.00,
      [LoanStatus.CLOSED]: 0.00
    };
    return rates[status];
  }
}