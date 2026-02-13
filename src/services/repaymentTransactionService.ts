// @ts-nocheck

import { Repository, QueryRunner, Between } from "typeorm";
import { RepaymentTransaction, PaymentMethod } from "../entities/RepaymentTransaction";
import { RepaymentSchedule, ScheduleStatus, PaymentStatus } from "../entities/RepaymentSchedule";
import { Loan, LoanStatus, InterestMethod, RepaymentFrequency } from "../entities/Loan";
import dbConnection from "../db";
import { v4 as uuidv4 } from 'uuid';
import { ClassificationAutomationService } from './classificationAutomationService';
import { ClientBorrowerAccount } from '../entities/ClientBorrowerAccount';
import {
  sendPaymentInvoicePdf,
  buildPdfInvoiceData,
} from '../templates/paymentInvoicePdfService';
export interface PaymentData {
  amountPaid: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  repaymentProof?: string;
  receivedBy?: string;
  approvedBy?: string;
  notes?: string;
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

export interface PaymentAllocation {
  principalPaid: number;
  interestPaid: number;
  penaltyPaid: number;
  totalAllocated: number;
  remainingAmount: number;
  delayedDaysInfo: DelayedDaysInfo[];
  blockedPayments?: Array<{
    installmentNumber: number;
    reason: string;
  }>;
}

export interface DelayedDaysInfo {
  installmentNumber: number;
  scheduledDueDate: Date;
  actualPaymentDate: Date;
  delayedDays: number;
  wasEarlyPayment: boolean;
}

export interface PaymentSummary {
  totalPaid: number;
  principalPaidToDate: number;
  interestPaidToDate: number;
  penaltiesAccrued: number;
  outstandingPrincipal: number;
  accruedInterestToDate: number;
  lastPaymentDate: Date | null;
  nextPaymentDueDate: Date | null;
  paymentFrequency: string;
  totalTransactions: number;
  totalDelayedDays: number;
  averageDelayedDays: number;
  maxDelayedDays: number;
  // NEW: Enhanced payment tracking metrics
  paidInstallments: number;
  totalInstallments: number;
  upcomingInstallmentInfo: {
    installmentNumber: number;
    dueDate: Date;
    dueAmount: number;
    isPaid: boolean;
  } | null;
}

export class RepaymentTransactionService {
  private clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);

  constructor(
    private transactionRepository: Repository<RepaymentTransaction>,
    private scheduleRepository: Repository<RepaymentSchedule>,
    private loanRepository: Repository<Loan>
  ) { }



async processPayment(
  loanId: number,
  paymentData: PaymentData,
  organizationId: number,
  createdBy: number | null = null
): Promise<ServiceResponse> {
  const queryRunner = dbConnection.createQueryRunner();
  let transactionStarted = false; 

  try {
    await queryRunner.connect();

    await queryRunner.startTransaction();
    transactionStarted = true;

    const duplicateCheck = await this.validatePaymentNotDuplicate(
      loanId,
      paymentData.paymentDate,
      paymentData.amountPaid,
      queryRunner
    );

    if (!duplicateCheck.isValid) {
      throw new Error(duplicateCheck.message);
    }

    const loan = await queryRunner.manager.findOne(Loan, {
      where: { id: loanId, organizationId },
      relations: ['repaymentSchedules', 'borrower', 'transactions']
    });

    if (!loan) {
      throw new Error("Loan not found");
    }

    const validation = await this.validatePaymentAmountWithFrequency(
      loan,
      paymentData.amountPaid,
      queryRunner
    );

    if (!validation.isValid) {
      throw new Error(validation.message);
    }

    if (!loan.repaymentSchedules || loan.repaymentSchedules.length === 0) {
      throw new Error("No repayment schedules found for this loan. Please contact support.");
    }

    const accruedInterest = await this.calculateAccruedInterestInternal(
      loan,
      paymentData.paymentDate
    );

    await queryRunner.manager.update(Loan, loanId, {
      accruedInterestToDate: accruedInterest,
      updatedAt: new Date()
    });

    const allocationResult = await this.allocatePaymentToInstallmentsWithTracking(
      queryRunner,
      loan,
      paymentData.amountPaid,
      paymentData.paymentDate
    );

    const primarySchedule = await queryRunner.manager.findOne(RepaymentSchedule, {
      where: { id: allocationResult.primaryScheduleId }
    });

    if (!primarySchedule) {
      throw new Error(`Primary schedule with ID ${allocationResult.primaryScheduleId} not found`);
    }

    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const transaction = queryRunner.manager.create(RepaymentTransaction, {
      transactionId,
      loanId,
      scheduleId: allocationResult.primaryScheduleId,
      paymentDate: paymentData.paymentDate,
      amountPaid: Math.round(paymentData.amountPaid * 100) / 100,
      principalPaid: allocationResult.principalPaid,
      interestPaid: allocationResult.interestPaid,
      penaltyPaid: allocationResult.penaltyPaid,
      paymentMethod: paymentData.paymentMethod,
      repaymentProof: paymentData.repaymentProof,
      receivedBy: paymentData.receivedBy,
      approvedBy: paymentData.approvedBy,
      notes: this.formatNotesWithDelayedDays(
        paymentData.notes,
        allocationResult.delayedDaysInfo
      ),
      createdBy
    });

    const savedTransaction = await queryRunner.manager.save(transaction);

    await this.updateOutstandingPrincipal(
      loanId,
      allocationResult.principalPaid,
      queryRunner
    );

    const newOutstandingPrincipal =
      loan.outstandingPrincipal - allocationResult.principalPaid;
    const maxDelayedDays = await this.calculateMaxDelayedDaysForLoan(
      loanId,
      queryRunner
    );
    const newStatus = this.determineLoanStatusWithDelayedDays(
      newOutstandingPrincipal,
      maxDelayedDays,
      loan
    );

    await queryRunner.manager.update(Loan, loanId, {
      outstandingPrincipal: Math.max(0, newOutstandingPrincipal),
      daysInArrears: maxDelayedDays,
      status: newStatus,
      updatedAt: new Date()
    });

    const classificationResult =
      await ClassificationAutomationService.updateLoanClassification(
        queryRunner,
        loanId
      );
    const fullRepaidResult = await this.checkAndMarkLoanFullyRepaid(
      loanId,
      queryRunner
    );

    const finalStatus = fullRepaidResult.wasMarkedFullyRepaid
      ? LoanStatus.FULL_REPAID
      : newStatus;

    const receipt = await this.generatePaymentReceiptWithDelayedDays(
      savedTransaction,
      loan,
      allocationResult.delayedDaysInfo
    );

    const updatedLoan = await queryRunner.manager.findOne(Loan, {
      where: { id: loanId },
      relations: [
        'repaymentSchedules',
        'transactions',
        'classifications',
        'borrower',
        'organization',
        'clientAccount',
      ]
    });

    const performanceMetrics = updatedLoan?.getPerformanceMetrics();

    const loanStatusResult = {
      previousOutstanding: loan.outstandingPrincipal,
      newOutstanding: fullRepaidResult.wasMarkedFullyRepaid
        ? 0
        : Math.max(0, newOutstandingPrincipal),
      newStatus: finalStatus,
      maxDelayedDays,
      updatedMetrics: performanceMetrics,
      delayedDaysInfo: allocationResult.delayedDaysInfo,
      blockedPayments: allocationResult.blockedPayments,
      isFullyRepaid: fullRepaidResult.wasMarkedFullyRepaid,
      classification: {
        previousStatus: classificationResult.previousStatus,
        newStatus: finalStatus,
        daysOverdue: classificationResult.daysOverdue,
        wasReclassified:
          classificationResult.classificationChanged ||
          fullRepaidResult.wasMarkedFullyRepaid
      }
    };

    const currentLoan = updatedLoan ?? loan;

    // ── Fetch ClientBorrowerAccount ──────────────────────────────────────────
    // Strategy: ALWAYS query by ClientBorrowerAccount.loanId = loan.id (authoritative FK)
    // This works even when loan.clientAccountId is null (older records)
    // ─────────────────────────────────────────────────────────────────────────
    let clientAccountInfo: {
      id: number;
      accountNumber: string;
      borrowerType: string;
      borrowerNames: string | null;
      nationalId: string | null;
      profilePictureUrl: string | null;
      institutionName: string | null;
      tinNumber: string | null;
      businessNumber: string | null;
      profileRepresentative: string | null;
      createdAt: Date;
      isActive: boolean;
    } | null = null;

    try {
      // ── Primary: look up by ClientBorrowerAccount.loanId ──────────────────
      let clientAccount = await this.clientAccountRepository.findOne({
        where: {
          loanId: currentLoan.id,
          isActive: true,
        },
      });

      // ── Secondary fallback: look up by loan.clientAccountId ───────────────
      if (!clientAccount && currentLoan.clientAccountId) {
        clientAccount = await this.clientAccountRepository.findOne({
          where: {
            id: currentLoan.clientAccountId,
            isActive: true,
          },
        });
      }

      // ── Tertiary fallback: try without isActive filter ─────────────────────
      if (!clientAccount) {
        clientAccount = await this.clientAccountRepository.findOne({
          where: { loanId: currentLoan.id },
        });
      }

      if (clientAccount) {
        clientAccountInfo = {
          id: clientAccount.id,
          accountNumber: clientAccount.accountNumber,
          borrowerType: clientAccount.borrowerType,
          borrowerNames: clientAccount.borrowerNames ?? null,
          nationalId: clientAccount.nationalId ?? null,
          profilePictureUrl: clientAccount.profilePictureUrl ?? null,
          institutionName: clientAccount.institutionName ?? null,
          tinNumber: clientAccount.tinNumber ?? null,
          businessNumber: clientAccount.businessNumber ?? null,
          profileRepresentative: clientAccount.profileRepresentative
            ? (typeof clientAccount.profileRepresentative === 'string'
                ? clientAccount.profileRepresentative
                : JSON.stringify(clientAccount.profileRepresentative))
            : null,
          createdAt: clientAccount.createdAt,
          isActive: clientAccount.isActive,
        };
        console.log(`[processPayment] Found clientAccount: ${clientAccount.accountNumber} for loan.id=${currentLoan.id}`);
      } else {
        console.log(`[processPayment] No clientAccount found for loan.id=${currentLoan.id}, clientAccountId=${currentLoan.clientAccountId}`);
      }
    } catch (accountErr: any) {
      console.warn('[processPayment] Could not fetch clientAccount:', accountErr?.message);
    }

    // ── PDF Invoice email (fire-and-forget, never blocks payment commit) ─────
    const _borrowerEmail = currentLoan?.borrower?.email;
    if (_borrowerEmail) {
      try {
        const invoiceData = buildPdfInvoiceData({
          savedTransaction,
          loan: currentLoan,
          allocationResult,
          updatedMetrics: performanceMetrics,
          loanStatusResult,
          receipt,
          clientAccountInfo,
        });
        sendPaymentInvoicePdf(_borrowerEmail, invoiceData).catch(() => {});
      } catch (_err) {
        // Swallow — invoice is non-critical
      }
    }
    // ── End PDF Invoice ──────────────────────────────────────────────────────

    await queryRunner.commitTransaction();

    return {
      success: true,
      message: fullRepaidResult.wasMarkedFullyRepaid
        ? "Payment processed successfully. Loan is now fully repaid!"
        : "Payment processed successfully with automatic classification",
      data: {
        transaction: savedTransaction,
        allocation: allocationResult,
        performanceMetrics,
        receipt,
        loanStatus: loanStatusResult,

        // ── ClientBorrowerAccount (mirrors disbursement controller output) ──
        borrowerAccount: clientAccountInfo,

        // ── Organization from DB record (not JWT — so name/email are real) ──
        organization: currentLoan?.organization
          ? {
              id: currentLoan.organization.id,
              name: currentLoan.organization.name,
              email: currentLoan.organization.email ?? undefined,
              phone: currentLoan.organization.phone ?? undefined,
              registrationNumber: currentLoan.organization.registrationNumber ?? undefined,
              address: currentLoan.organization.address ?? undefined,
              logoUrl: currentLoan.organization.logoUrl ?? undefined,
            }
          : null,
      }
    };

  } catch (error: any) {
    if (transactionStarted) {
      await queryRunner.rollbackTransaction();
    }

    return {
      success: false,
      message: error.message || "Failed to process payment"
    };
  } finally {
    await queryRunner.release();
  }
}





private async checkAndMarkLoanFullyRepaid(
  loanId: number,
  queryRunner: QueryRunner
): Promise<{ wasMarkedFullyRepaid: boolean }> {
  try {
    // ── Step A: count ALL schedules for this loan ──────────────────────────
    const totalSchedules = await queryRunner.manager.count(RepaymentSchedule, {
      where: { loanId },
    });

    // Safety: a loan with no schedules is not "fully repaid"
    if (totalSchedules === 0) {
      return { wasMarkedFullyRepaid: false };
    }

    const paidSchedules = await queryRunner.manager.count(RepaymentSchedule, {
      where: { loanId, isPaid: true },
    });

    // ── Step C: only if every single installment is paid ──────────────────
    if (paidSchedules !== totalSchedules) {
      // Some installments are still unpaid — not done yet
      return { wasMarkedFullyRepaid: false };
    }

    // ── Step D: check the loan's current status (idempotent guard) ────────
    const loan = await queryRunner.manager.findOne(Loan, {
      where: { id: loanId },
      select: ["id", "status"],
    });

    if (!loan) {
      return { wasMarkedFullyRepaid: false };
    }

    if (loan.status === LoanStatus.FULL_REPAID) {
      // Already marked — nothing to do
      return { wasMarkedFullyRepaid: false };
    }

    // ── Step E: mark the loan as FULL_REPAID ──────────────────────────────
    await queryRunner.manager.update(Loan, loanId, {
      status: LoanStatus.FULL_REPAID,
      outstandingPrincipal: 0,
      accruedInterestToDate: 0,
      daysInArrears: 0,
      updatedAt: new Date(),
    });

    console.log(
      `[checkAndMarkLoanFullyRepaid] Loan ${loanId} → FULL_REPAID` +
      ` (${paidSchedules}/${totalSchedules} installments paid).`
    );

    return { wasMarkedFullyRepaid: true };

  } catch (err: any) {
    // Non-fatal: the payment itself is already saved and will be committed.
    // A failed status upgrade is recoverable; a rolled-back payment is not.
    console.error(
      `[checkAndMarkLoanFullyRepaid] Non-fatal error for loan ${loanId}: ${err?.message}`
    );
    return { wasMarkedFullyRepaid: false };
  }
}

private async validatePaymentAmountWithFrequency(
  loan: Loan,
  paymentAmount: number,
  queryRunner: QueryRunner
): Promise<{ isValid: boolean; message: string; suggestedAmount?: number }> {
  
  // Get next unpaid installment from schedule
  const nextUnpaidSchedule = await queryRunner.manager
    .createQueryBuilder(RepaymentSchedule, 'schedule')
    .where('schedule.loanId = :loanId', { loanId: loan.id })
    .andWhere('schedule.isPaid = :isPaid', { isPaid: false })
    .orderBy('schedule.dueDate', 'ASC')
    .getOne();

  if (!nextUnpaidSchedule) {
    return {
      isValid: false,
      message: "No unpaid installments found"
    };
  }

  // Basic validation
  if (paymentAmount <= 0) {
    return {
      isValid: false,
      message: "Payment amount must be greater than zero"
    };
  }

  // Check if amount is reasonable (within 200% of next installment)
  const maxReasonableAmount = nextUnpaidSchedule.dueTotal * 2;
  if (paymentAmount > maxReasonableAmount) {
    return {
      isValid: false,
      message: `Payment amount (${paymentAmount.toFixed(2)}) exceeds reasonable limit for ${loan.repaymentFrequency} frequency. Suggested: ${nextUnpaidSchedule.dueTotal.toFixed(2)}`
    };
  }

  return {
    isValid: true,
    message: "Payment amount validated",
    suggestedAmount: nextUnpaidSchedule.dueTotal
  };
}

  private async validatePaymentNotDuplicate(
    loanId: number,
    paymentDate: Date,
    amount: number,
    queryRunner: QueryRunner
  ): Promise<{ isValid: boolean; message: string }> {
    // Allow multiple transactions per day - validation removed
    return {
      isValid: true,
      message: "Payment validation passed"
    };
  }

  private async allocatePaymentToInstallmentsWithTracking(
    queryRunner: QueryRunner,
    loan: Loan,
    paymentAmount: number,
    paymentDate: Date
  ): Promise<PaymentAllocation & { primaryScheduleId: number; delayedDaysInfo: DelayedDaysInfo[]; blockedPayments?: Array<{ installmentNumber: number; reason: string; }> }> {
    let remainingAmount = paymentAmount;
    let totalPrincipalPaid = 0;
    let totalInterestPaid = 0;
    let totalPenaltyPaid = 0;
    let primaryScheduleId: number | null = null;
    const delayedDaysInfo: DelayedDaysInfo[] = [];
    const blockedPayments: Array<{ installmentNumber: number; reason: string; }> = [];

    // Get all schedules ordered by due date
    const schedules = await queryRunner.manager.find(RepaymentSchedule, {
      where: { loanId: loan.id },
      order: { dueDate: 'ASC' }
    });

    if (!schedules || schedules.length === 0) {
      throw new Error("No repayment schedules found for this loan.");
    }

    const paymentDateObj = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);

    // Categorize schedules
    const overdueSchedules = schedules.filter(s => {
      const dueDate = s.dueDate instanceof Date ? s.dueDate : new Date(s.dueDate);
      return dueDate < paymentDateObj && !s.isPaid;
    });

    const currentSchedules = schedules.filter(s => {
      const dueDate = s.dueDate instanceof Date ? s.dueDate : new Date(s.dueDate);
      return dueDate <= paymentDateObj && !s.isPaid && !overdueSchedules.includes(s);
    });


    for (const schedule of overdueSchedules) {
      if (remainingAmount <= 0) break;

      // Check if payment can be accepted (duplicate prevention)
      if (!schedule.canAcceptPayment()) {
        blockedPayments.push({
          installmentNumber: schedule.installmentNumber,
          reason: schedule.isPaid ? "Already paid" : "Recent payment attempt detected"
        });
        continue;
      }

      if (!primaryScheduleId) primaryScheduleId = schedule.id;

      const delayedDays = schedule.calculateDelayedDays(paymentDateObj);
      const duePrincipal = Math.max(0, schedule.duePrincipal - schedule.paidPrincipal);
      const dueInterest = Math.max(0, schedule.dueInterest - schedule.paidInterest);
      const totalDue = duePrincipal + dueInterest;

      if (totalDue <= 0) continue;

      // Calculate penalties
      let penaltyAmount = 0;
      if (delayedDays > 0) {
        const penaltyRate = 0.05;
        penaltyAmount = Math.min(
          (totalDue * penaltyRate * delayedDays) / 365,
          remainingAmount
        );
        penaltyAmount = Math.round(penaltyAmount * 100) / 100;

        if (penaltyAmount > 0) {
          totalPenaltyPaid += penaltyAmount;
          remainingAmount -= penaltyAmount;
          schedule.penaltyAmount = (schedule.penaltyAmount || 0) + penaltyAmount;
        }
      }

      const paymentResult = schedule.applyPayment(
        Math.min(remainingAmount, totalDue),
        paymentDateObj
      );


      if (paymentResult.wasBlocked) {
        blockedPayments.push({
          installmentNumber: schedule.installmentNumber,
          reason: paymentResult.blockReason || "Payment blocked"
        });
        continue;
      }

      totalPrincipalPaid += paymentResult.principalPaid;
      totalInterestPaid += paymentResult.interestPaid;
      remainingAmount = paymentResult.excessAmount;

      // Track delayed days info
      delayedDaysInfo.push({
        installmentNumber: schedule.installmentNumber,
        scheduledDueDate: schedule.dueDate,
        actualPaymentDate: paymentDateObj,
        delayedDays: delayedDays,
        wasEarlyPayment: false
      });

      // CRITICAL: Save to database immediately
      const savedSchedule = await queryRunner.manager.save(schedule);

    }

    // 2. Process current installments
    if (remainingAmount > 0) {
      for (const schedule of currentSchedules) {
        if (remainingAmount <= 0) break;

        if (!schedule.canAcceptPayment()) {
          blockedPayments.push({
            installmentNumber: schedule.installmentNumber,
            reason: "Already paid or recent attempt"
          });
          continue;
        }

        if (!primaryScheduleId) primaryScheduleId = schedule.id;

        const delayedDays = schedule.calculateDelayedDays(paymentDateObj);
        const duePrincipal = Math.max(0, schedule.duePrincipal - schedule.paidPrincipal);
        const dueInterest = Math.max(0, schedule.dueInterest - schedule.paidInterest);
        const totalDue = duePrincipal + dueInterest;

        if (totalDue <= 0) continue;

        const paymentResult = schedule.applyPayment(
          Math.min(remainingAmount, totalDue),
          paymentDateObj
        );

        if (paymentResult.wasBlocked) {
          blockedPayments.push({
            installmentNumber: schedule.installmentNumber,
            reason: paymentResult.blockReason || "Payment blocked"
          });
          continue;
        }

        totalPrincipalPaid += paymentResult.principalPaid;
        totalInterestPaid += paymentResult.interestPaid;
        remainingAmount = paymentResult.excessAmount;

        delayedDaysInfo.push({
          installmentNumber: schedule.installmentNumber,
          scheduledDueDate: schedule.dueDate,
          actualPaymentDate: paymentDateObj,
          delayedDays: delayedDays,
          wasEarlyPayment: delayedDays === 0 && paymentDateObj <= schedule.dueDate
        });

        await queryRunner.manager.save(schedule);
      }
    }

    // 3. Process future installments (prepayments)
    if (remainingAmount > 0) {
      const futureSchedules = schedules.filter(s => {
        const dueDate = s.dueDate instanceof Date ? s.dueDate : new Date(s.dueDate);
        return dueDate > paymentDateObj && !s.isPaid;
      });

      for (const schedule of futureSchedules) {
        if (remainingAmount <= 0) break;

        if (!schedule.canAcceptPayment()) {
          blockedPayments.push({
            installmentNumber: schedule.installmentNumber,
            reason: "Already paid or recent attempt"
          });
          continue;
        }

        if (!primaryScheduleId) primaryScheduleId = schedule.id;

        const paymentResult = schedule.applyPayment(remainingAmount, paymentDateObj);

        if (paymentResult.wasBlocked) {
          blockedPayments.push({
            installmentNumber: schedule.installmentNumber,
            reason: paymentResult.blockReason || "Payment blocked"
          });
          continue;
        }

        totalPrincipalPaid += paymentResult.principalPaid;
        totalInterestPaid += paymentResult.interestPaid;
        remainingAmount = paymentResult.excessAmount;

        delayedDaysInfo.push({
          installmentNumber: schedule.installmentNumber,
          scheduledDueDate: schedule.dueDate,
          actualPaymentDate: paymentDateObj,
          delayedDays: 0,
          wasEarlyPayment: true
        });

        await queryRunner.manager.save(schedule);
      }
    }

    if (primaryScheduleId === null) {
      if (schedules.length > 0) {
        primaryScheduleId = schedules[0].id;
      } else {
        throw new Error("No valid repayment schedules available");
      }
    }

    const result = {
      principalPaid: Math.round(totalPrincipalPaid * 100) / 100,
      interestPaid: Math.round(totalInterestPaid * 100) / 100,
      penaltyPaid: Math.round(totalPenaltyPaid * 100) / 100,
      totalAllocated: Math.round((paymentAmount - remainingAmount) * 100) / 100,
      remainingAmount: Math.round(remainingAmount * 100) / 100,
      primaryScheduleId: primaryScheduleId!,
      delayedDaysInfo: delayedDaysInfo,
      blockedPayments: blockedPayments.length > 0 ? blockedPayments : undefined
    };

   
    return result;
  }


  async performDailyDelayedDaysUpdate(organizationId?: number): Promise<ServiceResponse> {
    try {

      let scheduleQuery = this.scheduleRepository
        .createQueryBuilder('schedule')
        .leftJoin('schedule.loan', 'loan')
        .where('schedule.status IN (:...statuses)', {
          statuses: [ScheduleStatus.PENDING, ScheduleStatus.PARTIAL, ScheduleStatus.OVERDUE]
        })
        .andWhere('schedule.dueDate < :today', { today: new Date() });

      if (organizationId) {
        scheduleQuery = scheduleQuery.andWhere('loan.organizationId = :organizationId', { organizationId });
      }

      const overdueSchedules = await scheduleQuery.getMany();

      let updatedSchedules = 0;
      let totalDelayedDaysAdded = 0;

      for (const schedule of overdueSchedules) {
        const previousDelayedDays = schedule.delayedDays;

        // Increment delayed days using the new method
        schedule.incrementDelayedDays();

        if (schedule.delayedDays !== previousDelayedDays) {
          await this.scheduleRepository.save(schedule);
          updatedSchedules++;
          totalDelayedDaysAdded += (schedule.delayedDays - previousDelayedDays);
        }
      }

      // Update loan-level days in arrears based on maximum delayed days
      if (updatedSchedules > 0) {
        await this.updateLoanDaysInArrearsFromDelayedDays(organizationId);
      }


      return {
        success: true,
        message: `Daily delayed days update completed for ${updatedSchedules} schedules`,
        data: {
          updatedSchedules,
          totalDelayedDaysAdded,
          organizationId: organizationId || 'all'
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to perform daily delayed days update",
        data: { error: error.message }
      };
    }
  }

  // NEW: Update loan days in arrears based on maximum delayed days from installments
  private async updateLoanDaysInArrearsFromDelayedDays(organizationId?: number): Promise<void> {
    try {
      let loanQuery = this.loanRepository
        .createQueryBuilder('loan')
        .leftJoin('loan.repaymentSchedules', 'schedules')
        .where('loan.status IN (:...statuses)', {
          statuses: [LoanStatus.DISBURSED, LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL]
        });

      if (organizationId) {
        loanQuery = loanQuery.andWhere('loan.organizationId = :organizationId', { organizationId });
      }

      const loans = await loanQuery.getMany();

      for (const loan of loans) {
        const maxDelayedDays = await this.calculateMaxDelayedDaysForLoan(loan.id);

        if (loan.daysInArrears !== maxDelayedDays) {
          await this.loanRepository.update(loan.id, {
            daysInArrears: maxDelayedDays,
            updatedAt: new Date()
          });
        }
      }
    } catch (error) {
      // console.error("Error updating loan days in arrears:", error);
    }
  }

  private async calculateMaxDelayedDaysForLoan(
    loanId: number,
    queryRunner?: QueryRunner
  ): Promise<number> {
    const manager = queryRunner ? queryRunner.manager : this.scheduleRepository.manager;

    const result = await manager
      .createQueryBuilder(RepaymentSchedule, 'schedule')
      .select('MAX(schedule.delayedDays)', 'maxDelayedDays')
      .where('schedule.loanId = :loanId', { loanId })
      .andWhere('schedule.isPaid = :isPaid', { isPaid: false })
      .getRawOne();

    return parseInt(result?.maxDelayedDays || '0');
  }

  // Enhanced loan status determination with delayed days
  private determineLoanStatusWithDelayedDays(
    outstandingPrincipal: number,
    maxDelayedDays: number,
    loan: Loan
  ): LoanStatus {
    if (outstandingPrincipal <= 0) {
      return LoanStatus.CLOSED;
    }

    if (maxDelayedDays <= 30) return LoanStatus.PERFORMING;
    if (maxDelayedDays <= 90) return LoanStatus.WATCH;
    if (maxDelayedDays <= 180) return LoanStatus.SUBSTANDARD;
    if (maxDelayedDays <= 365) return LoanStatus.DOUBTFUL;
    return LoanStatus.LOSS;
  }

  private formatNotesWithDelayedDays(
    originalNotes: string | undefined,
    delayedDaysInfo: DelayedDaysInfo[]
  ): string {
    let notes = originalNotes || '';

    if (delayedDaysInfo.length > 0) {
      const delayedDaysSummary = delayedDaysInfo.map(info =>
        `Installment ${info.installmentNumber}: ${info.delayedDays} delayed days ${info.wasEarlyPayment ? '(Early)' : ''}`
      ).join('; ');

      notes += notes ? `\n\nDelayed Days: ${delayedDaysSummary}` : `Delayed Days: ${delayedDaysSummary}`;
    }

    return notes;
  }

  private async generatePaymentReceiptWithDelayedDays(
    transaction: RepaymentTransaction,
    loan: Loan,
    delayedDaysInfo: DelayedDaysInfo[]
  ): Promise<any> {
    // Helper to safely format dates
    const formatDate = (date: any): string => {
      if (!date) return 'N/A';

      // If it's already a string in YYYY-MM-DD format, return as-is
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
        return date.split('T')[0];
      }

      // If it's a Date object, convert it
      if (date instanceof Date) {
        return date.toISOString().split('T')[0];
      }

      // Try to parse it as a date
      try {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      } catch (e) {
        // console.warn('Could not parse date:', date);
      }

      return String(date);
    };

    return {
      receiptNumber: `RCP-${transaction.transactionId}`,
      transactionId: transaction.transactionId,
      paymentDate: transaction.paymentDate,
      borrowerName: loan.borrower?.fullName || 'N/A',
      loanId: loan.loanId,
      amountPaid: transaction.amountPaid,
      principalPaid: transaction.principalPaid,
      interestPaid: transaction.interestPaid,
      penaltyPaid: transaction.penaltyPaid,
      paymentMethod: transaction.paymentMethod,
      receivedBy: transaction.receivedBy,
      approvedBy: transaction.approvedBy,
      repaymentProof: transaction.repaymentProof,
      remainingBalance: loan.outstandingPrincipal + loan.accruedInterestToDate,
      delayedDaysBreakdown: delayedDaysInfo.map(info => ({
        installmentNumber: info.installmentNumber,
        scheduledDueDate: formatDate(info.scheduledDueDate),
        actualPaymentDate: formatDate(info.actualPaymentDate),
        delayedDays: info.delayedDays,
        wasEarlyPayment: info.wasEarlyPayment
      })),
      totalDelayedDays: delayedDaysInfo.reduce((sum, info) => sum + info.delayedDays, 0),
      hasEarlyPayments: delayedDaysInfo.some(info => info.wasEarlyPayment),
      generatedAt: new Date(),
      organizationName: loan.organization?.name || 'N/A'
    };
  }



  async getPaymentSummary(loanId: number, organizationId: number): Promise<ServiceResponse<PaymentSummary>> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ['transactions', 'repaymentSchedules']
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      // All existing calculation code stays the same...
      const activeTransactions = loan.transactions?.filter(t => t.isActive) || [];

      const principalPaidToDate = activeTransactions.reduce((sum, t) => sum + t.principalPaid, 0);
      const interestPaidToDate = activeTransactions.reduce((sum, t) => sum + t.interestPaid, 0);
      const totalPaid = principalPaidToDate + interestPaidToDate;

      const lastPaymentDate = activeTransactions.length > 0 ?
        activeTransactions.reduce((latest, t) =>
          t.paymentDate > latest ? t.paymentDate : latest, activeTransactions[0].paymentDate
        ) : null;

    const nextSchedule = loan.repaymentSchedules
      ?.filter(s => !s.isPaid && s.dueDate > new Date())
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    const nextPaymentDueDate = nextSchedule ? nextSchedule.dueDate : null;

      const penaltiesResult = await this.calculatePenalties(loanId, organizationId);
      const penaltiesAccrued = penaltiesResult.success ? penaltiesResult.data : 0;

      const accruedResult = await this.calculateAccruedInterest(loanId, new Date(), organizationId);
      const accruedInterestToDate = accruedResult.success ? accruedResult.data : 0;

      const schedules = loan.repaymentSchedules || [];
      const delayedDaysArray = schedules.map(s => s.delayedDays);
      const totalDelayedDays = delayedDaysArray.reduce((sum, days) => sum + days, 0);
      const maxDelayedDays = delayedDaysArray.length > 0 ? Math.max(...delayedDaysArray) : 0;
      const averageDelayedDays = delayedDaysArray.length > 0 ? totalDelayedDays / delayedDaysArray.length : 0;

      const paidInstallments = schedules.filter(s => s.isPaid).length;
      const totalInstallments = schedules.length;

      const upcomingInstallment = nextSchedule ? {
        installmentNumber: nextSchedule.installmentNumber ?? 0,
        dueDate: nextSchedule.dueDate,
        dueAmount: Number(nextSchedule.dueTotal ?? 0),
        isPaid: nextSchedule.isPaid
      } : null;

      // Get frequency label for user-friendly display
      const frequencyLabel = loan.repaymentFrequency ? this.getFrequencyLabel(loan.repaymentFrequency) : 'Payment';
      
      const summary: PaymentSummary = {
        totalPaid,
        principalPaidToDate,
        interestPaidToDate,
        penaltiesAccrued,
        outstandingPrincipal: loan.outstandingPrincipal || 0,
        accruedInterestToDate,
        lastPaymentDate,
        nextPaymentDueDate,
        paymentFrequency: frequencyLabel,
        totalTransactions: activeTransactions.length,
        totalDelayedDays: Math.round(totalDelayedDays),
        averageDelayedDays: Math.round(averageDelayedDays * 100) / 100,
        maxDelayedDays: maxDelayedDays,
        paidInstallments,
        totalInstallments,
        upcomingInstallmentInfo: upcomingInstallment
      };

      return {
        success: true,
        message: "Payment summary retrieved successfully",
        data: summary
      };

  } catch (error: any) {
    return {
      success: false,
      message: "Failed to retrieve payment summary"
    };
  }
}
private getFrequencyLabel(frequency: RepaymentFrequency): string {
  const labels: Record<RepaymentFrequency, string> = {
    [RepaymentFrequency.DAILY]: "Daily Payment",
    [RepaymentFrequency.WEEKLY]: "Weekly Payment", 
    [RepaymentFrequency.BIWEEKLY]: "Bi-Weekly Payment",
    [RepaymentFrequency.MONTHLY]: "Monthly Payment",
    [RepaymentFrequency.QUARTERLY]: "Quarterly Payment",
    [RepaymentFrequency.SEMI_ANNUALLY]: "Semi-Annual Payment",
    [RepaymentFrequency.ANNUALLY]: "Annual Payment"
  };
  return labels[frequency] || "Payment";
}

  async validatePaymentAmount(loanId: number, amount: number, organizationId: number): Promise<ServiceResponse<boolean>> {
    try {
      if (amount <= 0) {
        return {
          success: false,
          message: "Payment amount must be greater than zero"
        };
      }

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

      if (loan.status === LoanStatus.CLOSED) {
        return {
          success: false,
          message: "Cannot process payment for closed loan"
        };
      }

      const totalOutstanding = (loan.outstandingPrincipal || 0) + (loan.accruedInterestToDate || 0);

      if (amount > totalOutstanding * 1.1) {
        return {
          success: false,
          message: `Payment amount (${amount}) exceeds outstanding balance (${totalOutstanding.toFixed(2)})`
        };
      }

      return {
        success: true,
        message: "Payment amount is valid",
        data: true
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to validate payment amount"
      };
    }
  }

  private async updateOutstandingPrincipal(
    loanId: number,
    principalPaid: number,
    queryRunner?: QueryRunner
  ): Promise<void> {
    const manager = queryRunner ? queryRunner.manager : this.loanRepository.manager;

    if (principalPaid < 0) {
      throw new Error("Principal paid amount cannot be negative");
    }

    if (!isFinite(principalPaid) || isNaN(principalPaid)) {
      throw new Error("Principal paid amount must be a valid number");
    }

    const roundedPrincipalPaid = Math.round(principalPaid * 100) / 100;

    if (roundedPrincipalPaid === 0) {
      return;
    }

    await manager.query(
      'UPDATE loans SET "outstandingPrincipal" = "outstandingPrincipal" - $1, "updatedAt" = NOW() WHERE id = $2',
      [roundedPrincipalPaid, loanId]
    );
  }

  async calculateAccruedInterest(
    loanId: number,
    asOfDate: Date,
    organizationId: number
  ): Promise<ServiceResponse<number>> {
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

      const accruedInterest = await this.calculateAccruedInterestInternal(loan, asOfDate);

      return {
        success: true,
        message: "Accrued interest calculated successfully",
        data: accruedInterest
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to calculate accrued interest"
      };
    }
  }

  private async calculateAccruedInterestInternal(loan: Loan, asOfDate: Date): Promise<number> {
    if (!loan.disbursementDate) {
      return 0;
    }

    const disbursementDate = loan.disbursementDate instanceof Date
      ? loan.disbursementDate
      : new Date(loan.disbursementDate);

    const calculationDate = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);

    if (calculationDate < disbursementDate) {
      return 0;
    }

    const daysSinceDisbursement = Math.floor(
      (calculationDate.getTime() - disbursementDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const totalInterestPaid = loan.transactions?.reduce((sum, txn) =>
      sum + (txn.interestPaid || 0), 0) || 0;

    let accruedInterest: number;

    if (loan.interestMethod === InterestMethod.FLAT) {
      const totalInterest = loan.totalInterestAmount || 0;
      const termMonths = loan.termInMonths || 12;
      const dailyInterest = totalInterest / (termMonths * 30);
      accruedInterest = Math.min(
        dailyInterest * daysSinceDisbursement,
        totalInterest
      );
    } else {
      const annualRate = loan.annualInterestRate || 0;
      const dailyRate = annualRate / 100 / 365;
      const outstanding = loan.outstandingPrincipal || 0;
      accruedInterest = outstanding * dailyRate * daysSinceDisbursement;
    }

    const netAccruedInterest = Math.max(0, accruedInterest - totalInterestPaid);

    return Math.round(netAccruedInterest * 100) / 100;
  }
  async calculatePenalties(loanId: number, organizationId: number): Promise<ServiceResponse<number>> {
    try {
      const schedules = await this.scheduleRepository.find({
        where: { loanId },
        relations: ['loan']
      });

      if (!schedules.length || schedules[0].loan.organizationId !== organizationId) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      const today = new Date();
      let totalPenalties = 0;
      const penaltyRate = 0.05;

      for (const schedule of schedules) {
        if (schedule.dueDate < today && !schedule.isPaid) {
          const daysOverdue = Math.floor(
            (today.getTime() - schedule.dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysOverdue > 0) {
            const penalty = (schedule.remainingAmount * penaltyRate * daysOverdue) / 365;
            totalPenalties += penalty;
          }
        }
      }

      return {
        success: true,
        message: "Penalties calculated successfully",
        data: totalPenalties
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to calculate penalties"
      };
    }
  }

  async generatePaymentReceipt(
    transactionId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['loan', 'loan.borrower', 'loan.organization', 'schedule']
      });

      if (!transaction || transaction.loan.organizationId !== organizationId) {
        return {
          success: false,
          message: "Transaction not found"
        };
      }

      const receipt = await this.generatePaymentReceiptInternal(transaction, transaction.loan);

      return {
        success: true,
        message: "Payment receipt generated successfully",
        data: receipt
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to generate payment receipt"
      };
    }
  }

  private async generatePaymentReceiptInternal(
    transaction: RepaymentTransaction,
    loan: Loan
  ): Promise<any> {
    return {
      receiptNumber: `RCP-${transaction.transactionId}`,
      transactionId: transaction.transactionId,
      paymentDate: transaction.paymentDate,
      borrowerName: loan.borrower?.fullName || 'N/A',
      loanId: loan.loanId,
      amountPaid: transaction.amountPaid,
      principalPaid: transaction.principalPaid,
      interestPaid: transaction.interestPaid,
      penaltyPaid: transaction.penaltyPaid,
      paymentMethod: transaction.paymentMethod,
      receivedBy: transaction.receivedBy,
      approvedBy: transaction.approvedBy,
      repaymentProof: transaction.repaymentProof,
      remainingBalance: (loan.outstandingPrincipal || 0) + (loan.accruedInterestToDate || 0),
      generatedAt: new Date(),
      organizationName: loan.organization?.name || 'N/A'
    };
  }

  async getLoanTransactions(
    loanId: number,
    organizationId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const [transactions, totalItems] = await this.transactionRepository.findAndCount({
        where: { loanId },
        relations: ['loan', 'schedule'],
        order: { paymentDate: 'DESC', createdAt: 'DESC' },
        skip,
        take: limit
      });

      if (transactions.length > 0 && transactions[0].loan.organizationId !== organizationId) {
        return {
          success: false,
          message: "Unauthorized access to loan transactions"
        };
      }

      const totalPages = Math.ceil(totalItems / limit);

      return {
        success: true,
        message: "Loan transactions retrieved successfully",
        data: transactions,
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
        message: "Failed to retrieve loan transactions"
      };
    }
  }

  async getTransactionById(
    transactionId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['loan', 'loan.borrower', 'schedule']
      });

      if (!transaction) {
        return {
          success: false,
          message: "Transaction not found"
        };
      }

      if (transaction.loan.organizationId !== organizationId) {
        return {
          success: false,
          message: "Unauthorized access to transaction"
        };
      }

      return {
        success: true,
        message: "Transaction retrieved successfully",
        data: transaction
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to retrieve transaction"
      };
    }
  }

  async reverseTransaction(
    transactionId: number,
    organizationId: number,
    reason: string,
    reversedBy: number | null = null
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const transaction = await queryRunner.manager.findOne(RepaymentTransaction, {
        where: { id: transactionId },
        relations: ['loan', 'schedule']
      });

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      if (transaction.loan.organizationId !== organizationId) {
        throw new Error("Unauthorized access to transaction");
      }

      if (!transaction.isActive) {
        throw new Error("Transaction is already reversed");
      }

      const reversalTransactionId = `REV-${transaction.transactionId}`;

      const reversalTransaction = queryRunner.manager.create(RepaymentTransaction, {
        transactionId: reversalTransactionId,
        loanId: transaction.loanId,
        scheduleId: transaction.scheduleId,
        paymentDate: new Date(),
        amountPaid: -transaction.amountPaid,
        principalPaid: -transaction.principalPaid,
        interestPaid: -transaction.interestPaid,
        penaltyPaid: -transaction.penaltyPaid,
        paymentMethod: transaction.paymentMethod,
        notes: `Reversal of ${transaction.transactionId}: ${reason}`,
        receivedBy: transaction.receivedBy,
        approvedBy: transaction.approvedBy,
        createdBy: reversedBy
      });

      await queryRunner.manager.save(reversalTransaction);

      await queryRunner.manager.update(RepaymentTransaction, transactionId, {
        isActive: false,
        notes: transaction.notes ?
          `${transaction.notes} [REVERSED: ${reason}]` :
          `[REVERSED: ${reason}]`
      });

      if (transaction.schedule) {
        transaction.schedule.paidPrincipal -= transaction.principalPaid;
        transaction.schedule.paidInterest -= transaction.interestPaid;
        transaction.schedule.paidTotal -= transaction.amountPaid;
        transaction.schedule.penaltyAmount -= transaction.penaltyPaid;
        // Reset delayed days on reversal if needed
        transaction.schedule.actualPaymentDate = null;
        transaction.schedule.updateStatus();

        await queryRunner.manager.save(transaction.schedule);
      }

      await queryRunner.manager.update(Loan, transaction.loanId, {
        outstandingPrincipal: transaction.loan.outstandingPrincipal + transaction.principalPaid,
        updatedAt: new Date()
      });

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Transaction reversed successfully",
        data: {
          originalTransaction: transaction,
          reversalTransaction,
          reason
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      return {
        success: false,
        message: error.message || "Failed to reverse transaction"
      };
    } finally {
      await queryRunner.release();
    }
  }

  private determineLoanStatus(outstandingPrincipal: number, loan: Loan): LoanStatus {
    if (outstandingPrincipal <= 0) {
      return LoanStatus.CLOSED;
    }

    const today = new Date();
    const overdueSchedules = loan.repaymentSchedules?.filter(s => {
      const dueDate = s.dueDate instanceof Date ? s.dueDate : new Date(s.dueDate);
      return dueDate < today && s.status !== ScheduleStatus.PAID;
    }) || [];

    let daysInArrears = 0;
    if (overdueSchedules.length > 0) {
      const earliestOverdue = overdueSchedules.reduce((earliest, s) => {
        const earliestDue = earliest.dueDate instanceof Date ? earliest.dueDate : new Date(earliest.dueDate);
        const currentDue = s.dueDate instanceof Date ? s.dueDate : new Date(s.dueDate);
        return currentDue < earliestDue ? s : earliest;
      });

      const earliestDueDate = earliestOverdue.dueDate instanceof Date ? earliestOverdue.dueDate : new Date(earliestOverdue.dueDate);
      daysInArrears = Math.floor(
        (today.getTime() - earliestDueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    if (daysInArrears <= 30) return LoanStatus.PERFORMING;
    if (daysInArrears <= 90) return LoanStatus.WATCH;
    if (daysInArrears <= 180) return LoanStatus.SUBSTANDARD;
    if (daysInArrears <= 365) return LoanStatus.DOUBTFUL;
    return LoanStatus.LOSS;
  }
}