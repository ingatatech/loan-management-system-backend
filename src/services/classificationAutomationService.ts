
// @ts-nocheck

import { QueryRunner } from "typeorm";
import { Loan, LoanStatus } from "../entities/Loan";
import { LoanClassification } from "../entities/LoanClassification";

export class ClassificationAutomationService {

  static async updateLoanClassification(
    queryRunner: QueryRunner,
    loanId: number
  ): Promise<{
    previousStatus: LoanStatus;
    newStatus: LoanStatus;
    daysOverdue: number;
    classificationChanged: boolean;
  }> {
    console.log('=== AUTO-CLASSIFICATION START ===');
    console.log('Loan ID:', loanId);

    // Step 1: Load loan with schedules
    const loan = await queryRunner.manager.findOne(Loan, {
      where: { id: loanId },
      relations: ['repaymentSchedules', 'borrower', 'collaterals']
    });

    if (!loan) {
      throw new Error(`Loan ${loanId} not found for classification update`);
    }

    const previousStatus = loan.status;
    console.log('Previous status:', previousStatus);

    // Step 2: Calculate maximum days overdue from unpaid installments
    const maxDaysOverdue = loan.getMaxDaysOverdue();
    console.log('Maximum days overdue from unpaid installments:', maxDaysOverdue);

    // Step 3: Get automatic classification based on days overdue
    const newStatus = loan.getAutomaticClassification();
    console.log('New automatic status:', newStatus);

    // Step 4: Update loan status in database
    await queryRunner.manager.update(Loan, loanId, {
      status: newStatus,
      daysInArrears: maxDaysOverdue,
      updatedAt: new Date()
    });

    console.log('✓ Loan status updated in database');

    // Step 5: Create classification audit record
    if (previousStatus !== newStatus) {
      await this.createClassificationRecord(
        queryRunner,
        loan,
        previousStatus,
        newStatus,
        maxDaysOverdue
      );
      console.log('✓ Classification audit record created');
    }

    console.log('=== AUTO-CLASSIFICATION END ===');

    return {
      previousStatus,
      newStatus,
      daysOverdue: maxDaysOverdue,
      classificationChanged: previousStatus !== newStatus
    };
  }

  /**
   * Create audit record in LoanClassification table
   */
private static async createClassificationRecord(
  queryRunner: QueryRunner,
  loan: Loan,
  previousStatus: LoanStatus,
  newStatus: LoanStatus,
  daysOverdue: number
): Promise<void> {
  // ✅ FIXED: Use effectiveValue instead of collateralValue
  const collateralValue = loan.collaterals?.reduce(
    (sum, c) => sum + c.effectiveValue,  // Changed from c.collateralValue
    0
  ) || 0;

  const netExposure = Math.max(0, loan.outstandingPrincipal - collateralValue);
  const provisioningRate = this.getProvisioningRate(newStatus);
  const provisionRequired = netExposure * provisioningRate;

  const classification = queryRunner.manager.create(LoanClassification, {
    loanId: loan.id,
    classificationDate: new Date(),
    daysInArrears: daysOverdue,
    loanClass: this.mapStatusToLoanClass(newStatus),
    outstandingBalance: loan.outstandingPrincipal + loan.accruedInterestToDate,
    collateralValue,  // Now uses effective value with haircut
    netExposure,
    provisioningRate,
    provisionRequired,
    previousProvisionsHeld: 0,
    additionalProvisionsThisPeriod: provisionRequired,
    notes: `Auto-classified from ${previousStatus} to ${newStatus} based on ${daysOverdue} days overdue`
  });

  await queryRunner.manager.save(classification);
}


  private static mapStatusToLoanClass(status: LoanStatus): string {
    const mapping: Record<LoanStatus, string> = {
      [LoanStatus.PERFORMING]: 'NORMAL',
      [LoanStatus.WATCH]: 'WATCH',
      [LoanStatus.SUBSTANDARD]: 'SUBSTANDARD',
      [LoanStatus.DOUBTFUL]: 'DOUBTFUL',
      [LoanStatus.LOSS]: 'LOSS',
      [LoanStatus.PENDING]: 'NORMAL',
      [LoanStatus.APPROVED]: 'NORMAL',
      [LoanStatus.DISBURSED]: 'NORMAL',
      [LoanStatus.WRITTEN_OFF]: 'LOSS',
      [LoanStatus.CLOSED]: 'NORMAL'
    };
    return mapping[status];
  }

  /**
   * Helper: Get provisioning rate based on status
   */
  private static getProvisioningRate(status: LoanStatus): number {
    const rates: Record<LoanStatus, number> = {
      [LoanStatus.PERFORMING]: 0.01,
      [LoanStatus.WATCH]: 0.05,
      [LoanStatus.SUBSTANDARD]: 0.25,
      [LoanStatus.DOUBTFUL]: 0.50,
      [LoanStatus.LOSS]: 1.00,
      [LoanStatus.PENDING]: 0.01,
      [LoanStatus.APPROVED]: 0.01,
      [LoanStatus.DISBURSED]: 0.01,
      [LoanStatus.WRITTEN_OFF]: 1.00,
      [LoanStatus.CLOSED]: 0.00
    };
    return rates[status];
  }

  /**
   * Batch update all loans in organization (for daily cron job)
   */
  static async batchUpdateClassifications(
    queryRunner: QueryRunner,
    organizationId: number
  ): Promise<{
    totalLoans: number;
    classificationsUpdated: number;
    errors: string[];
  }> {
    console.log('=== BATCH CLASSIFICATION START ===');
    console.log('Organization ID:', organizationId);

    const loans = await queryRunner.manager.find(Loan, {
      where: { 
        organizationId,
        isActive: true
      },
      relations: ['repaymentSchedules']
    });

    console.log(`Processing ${loans.length} loans`);

    let classificationsUpdated = 0;
    const errors: string[] = [];

    for (const loan of loans) {
      try {
        const result = await this.updateLoanClassification(queryRunner, loan.id);
        if (result.classificationChanged) {
          classificationsUpdated++;
          console.log(`✓ Loan ${loan.loanId}: ${result.previousStatus} → ${result.newStatus}`);
        }
      } catch (error: any) {
        errors.push(`Loan ${loan.loanId}: ${error.message}`);
        console.error(`✗ Failed to classify loan ${loan.loanId}:`, error);
      }
    }

    console.log('=== BATCH CLASSIFICATION END ===');
    console.log(`Updated: ${classificationsUpdated} / ${loans.length}`);

    return {
      totalLoans: loans.length,
      classificationsUpdated,
      errors
    };
  }
}