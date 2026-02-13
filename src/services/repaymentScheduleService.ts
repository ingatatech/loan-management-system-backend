// @ts-nocheck

import { Repository, QueryRunner } from "typeorm";
import { RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";
import { Loan, LoanStatus, InterestMethod, RepaymentFrequency } from "../entities/Loan";
import { RepaymentTransaction } from "../entities/RepaymentTransaction";
import dbConnection from "../db";

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

export interface ScheduleUpdateResult {
  updatedSchedules: RepaymentSchedule[];
  newOutstandingBalance: number;
  nextDueDate: Date | null;
  totalAdjustment: number;
}

export interface PartialPaymentResult {
  scheduleId: number;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: ScheduleStatus;
}

export class RepaymentScheduleService {
  constructor(
    private scheduleRepository: Repository<RepaymentSchedule>,
    private loanRepository: Repository<Loan>,
    private transactionRepository: Repository<RepaymentTransaction>
  ) {}

  // 1. Update Schedule After Payment
  async updateScheduleAfterPayment(
    loanId: number,
    transactionId: number,
    organizationId: number
  ): Promise<ServiceResponse<ScheduleUpdateResult>> {
    const queryRunner = dbConnection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Get transaction details
      const transaction = await queryRunner.manager.findOne(RepaymentTransaction, {
        where: { id: transactionId },
        relations: ['loan']
      });

      if (!transaction || transaction.loan.organizationId !== organizationId) {
        throw new Error("Transaction not found or unauthorized access");
      }

      // Get all schedules for the loan
      const schedules = await queryRunner.manager.find(RepaymentSchedule, {
        where: { loanId },
        order: { installmentNumber: 'ASC' }
      });

      const updatedSchedules: RepaymentSchedule[] = [];
      let remainingPayment = transaction.amountPaid;
      let totalAdjustment = 0;

      // Update schedules based on payment allocation
      for (const schedule of schedules) {
        if (remainingPayment <= 0) break;

        const initialRemaining = schedule.remainingAmount;
        const paymentToApply = Math.min(remainingPayment, initialRemaining);

        if (paymentToApply > 0) {
          // Apply payment proportionally to principal and interest
          const principalRatio = schedule.duePrincipal / schedule.dueTotal;
          const interestRatio = schedule.dueInterest / schedule.dueTotal;

          const principalPayment = paymentToApply * principalRatio;
          const interestPayment = paymentToApply * interestRatio;

          schedule.paidPrincipal += principalPayment;
          schedule.paidInterest += interestPayment;
          schedule.paidTotal += paymentToApply;

          schedule.updateStatus();
          
          await queryRunner.manager.save(schedule);
          updatedSchedules.push(schedule);
          
          remainingPayment -= paymentToApply;
          totalAdjustment += paymentToApply;
        }
      }

      // Calculate new outstanding balance
      const loan = await queryRunner.manager.findOne(Loan, { where: { id: loanId } });
      const newOutstandingBalance = loan!.outstandingPrincipal - transaction.principalPaid;

      // Find next due date
      const nextUnpaidSchedule = schedules.find(s => 
        s.status !== ScheduleStatus.PAID && s.dueDate > new Date()
      );
      const nextDueDate = nextUnpaidSchedule ? nextUnpaidSchedule.dueDate : null;

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Schedule updated after payment successfully",
        data: {
          updatedSchedules,
          newOutstandingBalance,
          nextDueDate,
          totalAdjustment
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Update schedule after payment error:", error);
      
      return {
        success: false,
        message: error.message || "Failed to update schedule after payment"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // 2. Recalculate Schedule After Payment
  async recalculateScheduleAfterPayment(
    loanId: number,
    organizationId: number,
    recalculationType: 'REDUCE_INSTALLMENT' | 'REDUCE_TERM' = 'REDUCE_INSTALLMENT'
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const loan = await queryRunner.manager.findOne(Loan, {
        where: { id: loanId, organizationId },
        relations: ['repaymentSchedules', 'transactions']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      // Calculate current outstanding principal
      const totalPrincipalPaid = loan.transactions
        ?.filter(t => t.isActive)
        .reduce((sum, t) => sum + t.principalPaid, 0) || 0;
      
      const currentOutstanding = loan.disbursedAmount - totalPrincipalPaid;

      if (currentOutstanding <= 0) {
        return {
          success: true,
          message: "Loan is fully paid, no recalculation needed"
        };
      }

      // Get unpaid schedules
      const unpaidSchedules = loan.repaymentSchedules?.filter(s => 
        s.status !== ScheduleStatus.PAID
      ) || [];

      if (unpaidSchedules.length === 0) {
        return {
          success: true,
          message: "No unpaid installments to recalculate"
        };
      }

      // Recalculate based on type
      if (recalculationType === 'REDUCE_INSTALLMENT') {
        // Reduce installment amounts, keep the same term
        await this.recalculateWithReducedInstallments(queryRunner, loan, unpaidSchedules, currentOutstanding);
      } else {
        // Reduce term, keep the same installment amounts
        await this.recalculateWithReducedTerm(queryRunner, loan, unpaidSchedules, currentOutstanding);
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `Schedule recalculated successfully with ${recalculationType.toLowerCase().replace('_', ' ')} strategy`
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Recalculate schedule after payment error:", error);
      
      return {
        success: false,
        message: error.message || "Failed to recalculate schedule after payment"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // 3. Adjust Future Installments
  async adjustFutureInstallments(
    loanId: number,
    organizationId: number,
    adjustmentType: 'PROPORTIONAL' | 'EQUAL_DISTRIBUTION',
    adjustmentAmount: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const schedules = await queryRunner.manager.find(RepaymentSchedule, {
        where: { loanId },
        relations: ['loan'],
        order: { installmentNumber: 'ASC' }
      });

      if (!schedules.length || schedules[0].loan.organizationId !== organizationId) {
        throw new Error("Loan not found or unauthorized access");
      }

      const futureSchedules = schedules.filter(s => 
        s.status === ScheduleStatus.PENDING && s.dueDate > new Date()
      );

      if (futureSchedules.length === 0) {
        return {
          success: false,
          message: "No future installments to adjust"
        };
      }

      if (adjustmentType === 'PROPORTIONAL') {
        // Adjust proportionally based on installment amounts
        const totalFutureAmount = futureSchedules.reduce((sum, s) => sum + s.dueTotal, 0);
        
        for (const schedule of futureSchedules) {
          const proportion = schedule.dueTotal / totalFutureAmount;
          const adjustment = adjustmentAmount * proportion;
          
          // Distribute adjustment between principal and interest based on current ratio
          const principalRatio = schedule.duePrincipal / schedule.dueTotal;
          const interestRatio = schedule.dueInterest / schedule.dueTotal;
          
          schedule.duePrincipal += adjustment * principalRatio;
          schedule.dueInterest += adjustment * interestRatio;
          schedule.dueTotal += adjustment;
          
          await queryRunner.manager.save(schedule);
        }
      } else {
        // Equal distribution across all future installments
        const adjustmentPerInstallment = adjustmentAmount / futureSchedules.length;
        
        for (const schedule of futureSchedules) {
          const principalRatio = schedule.duePrincipal / schedule.dueTotal;
          const interestRatio = schedule.dueInterest / schedule.dueTotal;
          
          schedule.duePrincipal += adjustmentPerInstallment * principalRatio;
          schedule.dueInterest += adjustmentPerInstallment * interestRatio;
          schedule.dueTotal += adjustmentPerInstallment;
          
          await queryRunner.manager.save(schedule);
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `Future installments adjusted successfully using ${adjustmentType.toLowerCase().replace('_', ' ')} method`,
        data: {
          adjustedInstallments: futureSchedules.length,
          totalAdjustment: adjustmentAmount,
          adjustmentType
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Adjust future installments error:", error);
      
      return {
        success: false,
        message: error.message || "Failed to adjust future installments"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // 4. Handle Partial Payments
  async handlePartialPayments(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse<PartialPaymentResult[]>> {
    try {
      const schedules = await this.scheduleRepository.find({
        where: { loanId },
        relations: ['loan'],
        order: { dueDate: 'ASC' }
      });

      if (!schedules.length || schedules[0].loan.organizationId !== organizationId) {
        return {
          success: false,
          message: "Loan not found or unauthorized access"
        };
      }

      const partialPayments: PartialPaymentResult[] = [];

      for (const schedule of schedules) {
        if (schedule.status === ScheduleStatus.PARTIAL) {
          partialPayments.push({
            scheduleId: schedule.id,
            originalAmount: schedule.dueTotal,
            paidAmount: schedule.paidTotal,
            remainingAmount: schedule.remainingAmount,
            status: schedule.status
          });
        }
      }

      return {
        success: true,
        message: `Found ${partialPayments.length} installments with partial payments`,
        data: partialPayments
      };

    } catch (error: any) {
      console.error("Handle partial payments error:", error);
      return {
        success: false,
        message: "Failed to handle partial payments"
      };
    }
  }

  // 5. Generate Remaining Schedule
  async generateRemainingSchedule(
    loanId: number,
    organizationId: number,
    fromDate?: Date
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const loan = await queryRunner.manager.findOne(Loan, {
        where: { id: loanId, organizationId },
        relations: ['repaymentSchedules', 'transactions']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      const startDate = fromDate || new Date();
      
      // Calculate remaining principal
      const totalPrincipalPaid = loan.transactions
        ?.filter(t => t.isActive)
        .reduce((sum, t) => sum + t.principalPaid, 0) || 0;
      
      const remainingPrincipal = loan.disbursedAmount - totalPrincipalPaid;

      if (remainingPrincipal <= 0) {
        return {
          success: true,
          message: "Loan is fully paid, no remaining schedule needed",
          data: { remainingSchedule: [] }
        };
      }

      // Delete future unpaid schedules
      const futureSchedules = loan.repaymentSchedules?.filter(s => 
        s.dueDate > startDate && s.status === ScheduleStatus.PENDING
      ) || [];

      if (futureSchedules.length > 0) {
        await queryRunner.manager.delete(RepaymentSchedule, 
          futureSchedules.map(s => s.id)
        );
      }

      // Generate new remaining schedule
      const newSchedule = this.generateNewSchedule(
        loan,
        remainingPrincipal,
        startDate,
        futureSchedules.length
      );

      const savedSchedules = await queryRunner.manager.save(RepaymentSchedule, newSchedule);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Remaining schedule generated successfully",
        data: {
          remainingSchedule: savedSchedules,
          remainingPrincipal,
          numberOfInstallments: savedSchedules.length
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Generate remaining schedule error:", error);
      
      return {
        success: false,
        message: error.message || "Failed to generate remaining schedule"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // 6. Calculate Due Amounts
  async calculateDueAmounts(
    loanId: number,
    asOfDate: Date,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const schedules = await this.scheduleRepository.find({
        where: { loanId },
        relations: ['loan'],
        order: { dueDate: 'ASC' }
      });

      if (!schedules.length || schedules[0].loan.organizationId !== organizationId) {
        return {
          success: false,
          message: "Loan not found or unauthorized access"
        };
      }

      const dueSchedules = schedules.filter(s => s.dueDate <= asOfDate);
      
      const totalDuePrincipal = dueSchedules.reduce((sum, s) => 
        sum + (s.duePrincipal - s.paidPrincipal), 0);
      
      const totalDueInterest = dueSchedules.reduce((sum, s) => 
        sum + (s.dueInterest - s.paidInterest), 0);

      const totalDueAmount = totalDuePrincipal + totalDueInterest;

      // Calculate overdue amounts
      const overdueSchedules = schedules.filter(s => 
        s.dueDate < asOfDate && s.status !== ScheduleStatus.PAID
      );

      const totalOverduePrincipal = overdueSchedules.reduce((sum, s) => 
        sum + (s.duePrincipal - s.paidPrincipal), 0);
      
      const totalOverdueInterest = overdueSchedules.reduce((sum, s) => 
        sum + (s.dueInterest - s.paidInterest), 0);

      const totalOverdueAmount = totalOverduePrincipal + totalOverdueInterest;

      return {
        success: true,
        message: "Due amounts calculated successfully",
        data: {
          asOfDate,
          totalDuePrincipal,
          totalDueInterest,
          totalDueAmount,
          totalOverduePrincipal,
          totalOverdueInterest,
          totalOverdueAmount,
          numberOfDueInstallments: dueSchedules.length,
          numberOfOverdueInstallments: overdueSchedules.length
        }
      };

    } catch (error: any) {
      console.error("Calculate due amounts error:", error);
      return {
        success: false,
        message: "Failed to calculate due amounts"
      };
    }
  }

  // 7. Get Overdue Installments
  async getOverdueInstallments(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const today = new Date();
      
      const overdueSchedules = await this.scheduleRepository
        .createQueryBuilder('schedule')
        .leftJoinAndSelect('schedule.loan', 'loan')
        .where('schedule.loanId = :loanId', { loanId })
        .andWhere('loan.organizationId = :organizationId', { organizationId })
        .andWhere('schedule.dueDate < :today', { today })
        .andWhere('schedule.status != :paidStatus', { paidStatus: ScheduleStatus.PAID })
        .orderBy('schedule.dueDate', 'ASC')
        .getMany();

      // Calculate days overdue for each schedule
      const enrichedSchedules = overdueSchedules.map(schedule => {
        const daysOverdue = Math.floor(
          (today.getTime() - schedule.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        return {
          ...schedule,
          daysOverdue,
          overdueAmount: schedule.remainingAmount
        };
      });

      const totalOverdueAmount = enrichedSchedules.reduce((sum, s) => 
        sum + s.overdueAmount, 0);

      return {
        success: true,
        message: `Found ${enrichedSchedules.length} overdue installments`,
        data: {
          overdueInstallments: enrichedSchedules,
          totalOverdueAmount,
          numberOfOverdueInstallments: enrichedSchedules.length,
          averageDaysOverdue: enrichedSchedules.length > 0 ? 
            enrichedSchedules.reduce((sum, s) => sum + s.daysOverdue, 0) / enrichedSchedules.length : 0
        }
      };

    } catch (error: any) {
      console.error("Get overdue installments error:", error);
      return {
        success: false,
        message: "Failed to get overdue installments"
      };
    }
  }

  // 8. Update Days in Arrears
  async updateDaysInArrears(loanId: number, organizationId: number): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const loan = await queryRunner.manager.findOne(Loan, {
        where: { id: loanId, organizationId },
        relations: ['repaymentSchedules']
      });

      if (!loan) {
        throw new Error("Loan not found");
      }

      const today = new Date();
      let maxDaysInArrears = 0;

      // Update days overdue for each schedule
      for (const schedule of loan.repaymentSchedules || []) {
        if (schedule.dueDate < today && schedule.status !== ScheduleStatus.PAID) {
          const daysOverdue = Math.floor(
            (today.getTime() - schedule.dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          schedule.daysOverdue = daysOverdue;
          maxDaysInArrears = Math.max(maxDaysInArrears, daysOverdue);
          
          await queryRunner.manager.save(schedule);
        } else {
          schedule.daysOverdue = 0;
          await queryRunner.manager.save(schedule);
        }
      }

      // Update loan's days in arrears
      await queryRunner.manager.update(Loan, loanId, {
        daysInArrears: maxDaysInArrears,
        updatedAt: new Date()
      });

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Days in arrears updated successfully",
        data: {
          maxDaysInArrears,
          updatedSchedules: loan.repaymentSchedules?.length || 0
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Update days in arrears error:", error);
      
      return {
        success: false,
        message: error.message || "Failed to update days in arrears"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // 9. Get Next Payment Due Date
  async getNextPaymentDueDate(loanId: number, organizationId: number): Promise<ServiceResponse<Date | null>> {
    try {
      const nextSchedule = await this.scheduleRepository
        .createQueryBuilder('schedule')
        .leftJoinAndSelect('schedule.loan', 'loan')
        .where('schedule.loanId = :loanId', { loanId })
        .andWhere('loan.organizationId = :organizationId', { organizationId })
        .andWhere('schedule.status = :status', { status: ScheduleStatus.PENDING })
        .andWhere('schedule.dueDate > :today', { today: new Date() })
        .orderBy('schedule.dueDate', 'ASC')
        .getOne();

      return {
        success: true,
        message: nextSchedule ? "Next payment due date found" : "No upcoming payments",
        data: nextSchedule ? nextSchedule.dueDate : null
      };

    } catch (error: any) {
      console.error("Get next payment due date error:", error);
      return {
        success: false,
        message: "Failed to get next payment due date"
      };
    }
  }

async scheduledInterestAccrual(organizationId?: number): Promise<ServiceResponse> {
    try {
        const queryBuilder = this.loanRepository
            .createQueryBuilder('loan')
            .leftJoinAndSelect('loan.repaymentSchedules', 'schedules')
            .where('loan.status IN (:...statuses)', { 
                statuses: [LoanStatus.DISBURSED, LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL] 
            });

        if (organizationId) {
            queryBuilder.andWhere('loan.organizationId = :organizationId', { organizationId });
        }

        const activeLoans = await queryBuilder.getMany();
        let processedLoans = 0;
        let totalInterestAccrued = 0;

        for (const loan of activeLoans) {
            try {
                const today = new Date();
                
                // Ensure disbursementDate is a Date object
                const disbursementDate = loan.disbursementDate instanceof Date 
                    ? loan.disbursementDate 
                    : new Date(loan.disbursementDate);
                
                const daysSinceDisbursement = Math.floor(
                    (today.getTime() - disbursementDate.getTime()) / (1000 * 60 * 60 * 24)
                );

                let dailyInterest = 0;
                if (loan.interestMethod === InterestMethod.FLAT) {
                    dailyInterest = loan.totalInterestAmount / (loan.termInMonths * 30);
                } else {
                    const dailyRate = loan.annualInterestRate / 100 / 365;
                    dailyInterest = loan.outstandingPrincipal * dailyRate;
                }

                const newAccruedInterest = loan.accruedInterestToDate + dailyInterest;

                await this.loanRepository.update(loan.id, {
                    accruedInterestToDate: newAccruedInterest,
                    updatedAt: new Date()
                });

                processedLoans++;
                totalInterestAccrued += dailyInterest;

            } catch (loanError: any) {
                console.error(`Error processing loan ${loan.id}:`, loanError);
            }
        }

        return {
            success: true,
            message: `Scheduled interest accrual completed for ${processedLoans} loans`,
            data: {
                processedLoans,
                totalInterestAccrued: Math.round(totalInterestAccrued * 100) / 100
            }
        };

    } catch (error: any) {
        console.error("Scheduled interest accrual error:", error);
        return {
            success: false,
            message: "Failed to perform scheduled interest accrual"
        };
    }
}

  // 11. Update Schedule Status
  async updateScheduleStatus(loanId: number, organizationId: number): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();
    
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const schedules = await queryRunner.manager.find(RepaymentSchedule, {
        where: { loanId },
        relations: ['loan']
      });

      if (!schedules.length || schedules[0].loan.organizationId !== organizationId) {
        throw new Error("Loan not found or unauthorized access");
      }

      let updatedCount = 0;
      const today = new Date();

      for (const schedule of schedules) {
        const oldStatus = schedule.status;
        schedule.updateStatus();

        // Additional logic for overdue status
        if (schedule.dueDate < today && schedule.status === ScheduleStatus.PENDING) {
          schedule.status = ScheduleStatus.OVERDUE;
        }

        if (oldStatus !== schedule.status) {
          await queryRunner.manager.save(schedule);
          updatedCount++;
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `Schedule status updated for ${updatedCount} installments`,
        data: {
          totalSchedules: schedules.length,
          updatedSchedules: updatedCount
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Update schedule status error:", error);
      
      return {
        success: false,
        message: error.message || "Failed to update schedule status"
      };
    } finally {
      await queryRunner.release();
    }
  }

async getLoanRepaymentSchedule(
  loanId: number,
  organizationId: number,
  page: number = 1,
  limit: number = 50
): Promise<ServiceResponse> {
  try {
    const skip = (page - 1) * limit;

    const [schedules, totalItems] = await this.scheduleRepository.findAndCount({
      where: { loanId },
      relations: ['loan'],
      order: { installmentNumber: 'ASC' },
      skip,
      take: limit
    });

    if (schedules.length > 0 && schedules[0].loan.organizationId !== organizationId) {
      return {
        success: false,
        message: "Unauthorized access to loan schedule"
      };
    }

    const totalPages = Math.ceil(totalItems / limit);

    // Calculate summary statistics with proper number handling
    const summary = {
      totalInstallments: totalItems,
      paidInstallments: schedules.filter(s => s.status === ScheduleStatus.PAID).length,
      pendingInstallments: schedules.filter(s => s.status === ScheduleStatus.PENDING).length,
      overdueInstallments: schedules.filter(s => s.status === ScheduleStatus.OVERDUE).length,
      partialInstallments: schedules.filter(s => s.status === ScheduleStatus.PARTIAL).length,
      
      // Fix: Convert string amounts to numbers and sum properly
      totalScheduledAmount: this.formatCompactNumber(
        schedules.reduce((sum, s) => sum + parseFloat(s.dueTotal.toString()), 0)
      ),
      totalPaidAmount: this.formatCompactNumber(
        schedules.reduce((sum, s) => sum + parseFloat(s.paidTotal.toString()), 0)
      ),
      totalRemainingAmount: this.formatCompactNumber(
        schedules.reduce((sum, s) => sum + parseFloat(s.remainingAmount.toString()), 0)
      ),
      
      // Add unformatted versions for calculations
      totalScheduledAmountUnformatted: schedules.reduce((sum, s) => sum + parseFloat(s.dueTotal.toString()), 0),
      totalPaidAmountUnformatted: schedules.reduce((sum, s) => sum + parseFloat(s.paidTotal.toString()), 0),
      totalRemainingAmountUnformatted: schedules.reduce((sum, s) => sum + parseFloat(s.remainingAmount.toString()), 0)
    };

    return {
      success: true,
      message: "Loan repayment schedule retrieved successfully",
      data: {
        schedules,
        summary
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit
      }
    };

  } catch (error: any) {
    console.error("Get loan repayment schedule error:", error);
    return {
      success: false,
      message: "Failed to retrieve loan repayment schedule"
    };
  }
}

private formatCompactNumber(value: number): string {
  if (value === 0) return '0';
  
  // Handle very large numbers
  if (value >= 1e9) {
    return (value / 1e9).toFixed(2) + 'B';
  }
  if (value >= 1e6) {
    return (value / 1e6).toFixed(2) + 'M';
  }
  if (value >= 1e3) {
    return (value / 1e3).toFixed(2) + 'K';
  }
  
  // For regular numbers, format with commas and 2 decimal places
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
  // Private helper methods
  private async recalculateWithReducedInstallments(
    queryRunner: QueryRunner,
    loan: Loan,
    unpaidSchedules: RepaymentSchedule[],
    currentOutstanding: number
  ): Promise<void> {
    const remainingTerms = unpaidSchedules.length;
    const monthlyRate = loan.annualInterestRate / 100 / 12;
    
    let newMonthlyInstallment: number;
    
    if (loan.interestMethod === InterestMethod.FLAT) {
      const remainingInterest = loan.totalInterestAmount * (remainingTerms / loan.totalNumberOfInstallments);
      newMonthlyInstallment = (currentOutstanding + remainingInterest) / remainingTerms;
    } else {
      if (monthlyRate === 0) {
        newMonthlyInstallment = currentOutstanding / remainingTerms;
      } else {
        newMonthlyInstallment = currentOutstanding * 
          (monthlyRate * Math.pow(1 + monthlyRate, remainingTerms)) /
          (Math.pow(1 + monthlyRate, remainingTerms) - 1);
      }
    }

    // Update each unpaid schedule
    let remainingPrincipal = currentOutstanding;
    
    for (let i = 0; i < unpaidSchedules.length; i++) {
      const schedule = unpaidSchedules[i];
      
      if (loan.interestMethod === InterestMethod.FLAT) {
        schedule.duePrincipal = currentOutstanding / remainingTerms;
        schedule.dueInterest = (newMonthlyInstallment - schedule.duePrincipal);
      } else {
        schedule.dueInterest = remainingPrincipal * monthlyRate;
        schedule.duePrincipal = newMonthlyInstallment - schedule.dueInterest;
        remainingPrincipal -= schedule.duePrincipal;
      }
      
      schedule.dueTotal = schedule.duePrincipal + schedule.dueInterest;
      schedule.outstandingPrincipal = Math.max(0, remainingPrincipal);
      
      await queryRunner.manager.save(schedule);
    }
  }

  private async recalculateWithReducedTerm(
    queryRunner: QueryRunner,
    loan: Loan,
    unpaidSchedules: RepaymentSchedule[],
    currentOutstanding: number
  ): Promise<void> {
    // Calculate how many installments are needed with current installment amount
    const currentInstallmentAmount = loan.monthlyInstallmentAmount;
    const monthlyRate = loan.annualInterestRate / 100 / 12;
    
    let requiredTerms: number;
    
    if (loan.interestMethod === InterestMethod.FLAT) {
      // For flat rate, calculate required terms
      const interestPerTerm = loan.totalInterestAmount / loan.totalNumberOfInstallments;
      const principalPerTerm = currentInstallmentAmount - interestPerTerm;
      requiredTerms = Math.ceil(currentOutstanding / principalPerTerm);
    } else {
      // For reducing balance, calculate required terms
      if (monthlyRate === 0) {
        requiredTerms = Math.ceil(currentOutstanding / currentInstallmentAmount);
      } else {
        requiredTerms = Math.ceil(
          Math.log(1 + (currentOutstanding * monthlyRate) / currentInstallmentAmount) /
          Math.log(1 + monthlyRate)
        );
      }
    }

    // Remove excess schedules if we need fewer terms
    if (requiredTerms < unpaidSchedules.length) {
      const schedulesToRemove = unpaidSchedules.slice(requiredTerms);
      await queryRunner.manager.delete(RepaymentSchedule, 
        schedulesToRemove.map(s => s.id)
      );
      unpaidSchedules.splice(requiredTerms);
    }
    
    // Recalculate remaining schedules
    let remainingPrincipal = currentOutstanding;
    
    for (let i = 0; i < Math.min(requiredTerms, unpaidSchedules.length); i++) {
      const schedule = unpaidSchedules[i];
      
      if (loan.interestMethod === InterestMethod.FLAT) {
        schedule.duePrincipal = Math.min(currentOutstanding / requiredTerms, remainingPrincipal);
        schedule.dueInterest = currentInstallmentAmount - schedule.duePrincipal;
      } else {
        schedule.dueInterest = remainingPrincipal * monthlyRate;
        schedule.duePrincipal = Math.min(currentInstallmentAmount - schedule.dueInterest, remainingPrincipal);
        remainingPrincipal -= schedule.duePrincipal;
      }
      
      schedule.dueTotal = schedule.duePrincipal + schedule.dueInterest;
      schedule.outstandingPrincipal = Math.max(0, remainingPrincipal);
      
      await queryRunner.manager.save(schedule);
    }
  }

  private generateNewSchedule(
    loan: Loan,
    remainingPrincipal: number,
    startDate: Date,
    startingInstallmentNumber: number
  ): RepaymentSchedule[] {
    const schedule: RepaymentSchedule[] = [];
    const monthlyRate = loan.annualInterestRate / 100 / 12;
    
    // Calculate number of remaining installments needed
    const remainingTerms = Math.ceil(loan.termInMonths * (remainingPrincipal / loan.disbursedAmount));
    
    let currentPrincipal = remainingPrincipal;
    let installmentAmount: number;
    
    // Calculate installment amount
    if (loan.interestMethod === InterestMethod.FLAT) {
      const remainingInterest = loan.totalInterestAmount * (remainingPrincipal / loan.disbursedAmount);
      installmentAmount = (remainingPrincipal + remainingInterest) / remainingTerms;
    } else {
      if (monthlyRate === 0) {
        installmentAmount = remainingPrincipal / remainingTerms;
      } else {
        installmentAmount = remainingPrincipal * 
          (monthlyRate * Math.pow(1 + monthlyRate, remainingTerms)) /
          (Math.pow(1 + monthlyRate, remainingTerms) - 1);
      }
    }

    // Generate schedule
    for (let i = 1; i <= remainingTerms; i++) {
      const dueDate = new Date(startDate);
      
      // Calculate due date based on repayment frequency
      switch (loan.repaymentFrequency) {
        case RepaymentFrequency.MONTHLY:
          dueDate.setMonth(startDate.getMonth() + i);
          break;
        case RepaymentFrequency.WEEKLY:
          dueDate.setDate(startDate.getDate() + (i * 7));
          break;
        case RepaymentFrequency.BIWEEKLY:
          dueDate.setDate(startDate.getDate() + (i * 14));
          break;
        // Add other frequencies as needed
        default:
          dueDate.setMonth(startDate.getMonth() + i);
      }

      let duePrincipal: number;
      let dueInterest: number;

      if (loan.interestMethod === InterestMethod.FLAT) {
        duePrincipal = remainingPrincipal / remainingTerms;
        dueInterest = installmentAmount - duePrincipal;
      } else {
        dueInterest = currentPrincipal * monthlyRate;
        duePrincipal = installmentAmount - dueInterest;
        currentPrincipal -= duePrincipal;
      }

      // Adjust final installment for any rounding differences
      if (i === remainingTerms) {
        duePrincipal = currentPrincipal + duePrincipal;
        currentPrincipal = 0;
      }

      const installment = new RepaymentSchedule();
      installment.loanId = loan.id;
      installment.installmentNumber = startingInstallmentNumber + i;
      installment.dueDate = dueDate;
      installment.duePrincipal = Math.round(duePrincipal * 100) / 100;
      installment.dueInterest = Math.round(dueInterest * 100) / 100;
      installment.dueTotal = Math.round((duePrincipal + dueInterest) * 100) / 100;
      installment.outstandingPrincipal = Math.round(currentPrincipal * 100) / 100;
      installment.status = ScheduleStatus.PENDING;
      installment.paidPrincipal = 0;
      installment.paidInterest = 0;
      installment.paidTotal = 0;
      installment.outstandingInterest = installment.dueInterest;
      installment.penaltyAmount = 0;
      installment.daysOverdue = 0;

      schedule.push(installment);
    }

    return schedule;
  }
}