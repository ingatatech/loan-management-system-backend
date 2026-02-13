import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from "typeorm";
import { Loan } from "./Loan";
import { RepaymentTransaction } from "./RepaymentTransaction";

export enum ScheduleStatus {
  PENDING = "pending",
  PAID = "paid",
  PARTIAL = "partial",
  OVERDUE = "overdue",
  WRITTEN_OFF = "written_off"
}

export enum PaymentStatus {
  PENDING = "pending", 
  PAID = "paid",       
  PARTIAL = "partial",  
  OVERDUE = "overdue"   
}

@Entity("repayment_schedules")
@Index(["loanId", "installmentNumber"], { unique: true })
@Index(["dueDate"])
@Index(["status"])
@Index(["delayedDays"])
@Index(["isPaid"]) // NEW: Index for payment tracking queries
@Index(["paymentStatus"]) // NEW: Index for status queries
export class RepaymentSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "int" })
  installmentNumber: number;

  @Column({ type: "date" })
  dueDate: Date;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  duePrincipal: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  dueInterest: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  dueTotal: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  paidPrincipal: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  paidInterest: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  paidTotal: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  outstandingPrincipal: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  outstandingInterest: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  penaltyAmount: number;

  @Column({
    type: "enum",
    enum: ScheduleStatus,
    default: ScheduleStatus.PENDING
  })
  status: ScheduleStatus;

  @Column({ type: "int", default: 0 })
  daysOverdue: number;

  @Column({ type: "int", default: 0 })
  delayedDays: number;

  @Column({ type: "date", nullable: true })
  actualPaymentDate: Date | null;

  @Column({ type: "date", nullable: true })
  paidDate: Date | null;

  // ========================================
  // NEW: Enhanced Payment Tracking Fields
  // ========================================
  
  @Column({ type: "boolean", default: false })
  isPaid: boolean;

  @Column({ type: "timestamp", nullable: true })
  paidTimestamp: Date | null;

  @Column({
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.PENDING
  })
  paymentStatus: PaymentStatus;

  @Column({ type: "timestamp", nullable: true })
  lastPaymentAttempt: Date | null;

  @Column({ type: "int", default: 0 })
  paymentAttemptCount: number;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Loan, (loan) => loan.repaymentSchedules)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @OneToMany(() => RepaymentTransaction, (transaction) => transaction.schedule)
  transactions: RepaymentTransaction[];

  // ========================================
  // Computed Properties
  // ========================================
  
  get remainingAmount(): number {
    return this.dueTotal - this.paidTotal;
  }

  get isFullyPaid(): boolean {
    return this.isPaid && this.paymentStatus === PaymentStatus.PAID;
  }

  get isOverdue(): boolean {
    return new Date() > this.dueDate && !this.isPaid;
  }

  // ========================================
  // NEW: Enhanced Business Methods
  // ========================================

  /**
   * Check if this installment can accept a new payment
   * Prevents duplicate payments
   */
  canAcceptPayment(): boolean {
    // Already fully paid
    if (this.isPaid && this.paymentStatus === PaymentStatus.PAID) {
      return false;
    }

    // Check for recent payment attempts (within 1 minute to prevent rapid duplicates)
    if (this.lastPaymentAttempt) {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      if (this.lastPaymentAttempt > oneMinuteAgo) {
        return false;
      }
    }

    return true;
  }

  /**
   * Mark installment as paid
   */
  markAsPaid(paymentDate: Date): void {
    this.isPaid = true;
    this.paidTimestamp = paymentDate;
    this.paidDate = paymentDate;
    this.paymentStatus = PaymentStatus.PAID;
    this.status = ScheduleStatus.PAID;
    this.actualPaymentDate = paymentDate;
    
    // Update delayed days tracking
    this.updateDelayedDaysOnPayment(paymentDate);
  }

  /**
   * Record a payment attempt (for duplicate prevention)
   */
  recordPaymentAttempt(): void {
    this.lastPaymentAttempt = new Date();
    this.paymentAttemptCount += 1;
  }

  /**
   * Calculate delayed days based on actual payment date vs due date
   */
  calculateDelayedDays(paymentDate: Date): number {
    if (!paymentDate) return this.delayedDays;
    
    const payment = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
    const due = this.dueDate instanceof Date ? this.dueDate : new Date(this.dueDate);
    
    const diffTime = payment.getTime() - due.getTime();
    const delayedDays = diffTime > 0 ? Math.floor(diffTime / (1000 * 60 * 60 * 24)) : 0;
    
    return Math.max(0, delayedDays);
  }

  /**
   * Update delayed days when payment is made
   */
  updateDelayedDaysOnPayment(paymentDate: Date): void {
    const payment = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
    const due = this.dueDate instanceof Date ? this.dueDate : new Date(this.dueDate);
    
    this.actualPaymentDate = payment;
    
    if (payment <= due) {
      // Early payment - reset delayed days to zero
      this.delayedDays = 0;
    } else {
      // Late payment - calculate exact delayed days
      this.delayedDays = this.calculateDelayedDays(payment);
    }
  }

  /**
   * Increment delayed days for daily background process
   */
  incrementDelayedDays(): void {
    if (this.status === ScheduleStatus.PAID) {
      return;
    }
    
    const today = new Date();
    const due = this.dueDate instanceof Date ? this.dueDate : new Date(this.dueDate);
    
    if (today > due && 
        [ScheduleStatus.PENDING, ScheduleStatus.PARTIAL, ScheduleStatus.OVERDUE].includes(this.status)) {
      
      const diffTime = today.getTime() - due.getTime();
      this.delayedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (this.delayedDays > 0 && this.status === ScheduleStatus.PENDING) {
        this.status = ScheduleStatus.OVERDUE;
        this.paymentStatus = PaymentStatus.OVERDUE;
      }
    }
  }

  /**
   * Enhanced status update with payment status sync
   */
updateStatus(): void {
  // Convert to numbers for comparison
  const paidTotalNum = Number(this.paidTotal) || 0;
  const dueTotalNum = Number(this.dueTotal) || 0;
  
  console.log('updateStatus called:', {
    paidTotalNum,
    dueTotalNum,
    currentStatus: this.status,
    currentPaymentStatus: this.paymentStatus,
    currentIsPaid: this.isPaid
  });

  if (paidTotalNum >= dueTotalNum) {
    this.status = ScheduleStatus.PAID;
    this.paymentStatus = PaymentStatus.PAID;
    this.isPaid = true;
    if (!this.paidDate) {
      this.paidDate = new Date();
    }
    console.log('✓ Status updated to PAID');
  } else if (paidTotalNum > 0) {
    this.status = ScheduleStatus.PARTIAL;
    this.paymentStatus = PaymentStatus.PARTIAL;
    this.isPaid = false;
    console.log('✓ Status updated to PARTIAL');
  } else if (this.isOverdue) {
    this.status = ScheduleStatus.OVERDUE;
    this.paymentStatus = PaymentStatus.OVERDUE;
    this.isPaid = false;
    console.log('✓ Status updated to OVERDUE');
  } else {
    this.status = ScheduleStatus.PENDING;
    this.paymentStatus = PaymentStatus.PENDING;
    this.isPaid = false;
    console.log('✓ Status updated to PENDING');
  }

  // Calculate days overdue
  if (this.isOverdue && !this.isPaid) {
    const today = new Date();
    const dueDate = this.dueDate instanceof Date ? this.dueDate : new Date(this.dueDate);
    const diffTime = Math.abs(today.getTime() - dueDate.getTime());
    this.daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else {
    this.daysOverdue = 0;
  }
}
  /**
   * Enhanced payment application with duplicate prevention
   */
applyPayment(
  amount: number, 
  paymentDate?: Date
): { 
  principalPaid: number; 
  interestPaid: number; 
  excessAmount: number;
  wasBlocked: boolean;
  blockReason?: string;
} {
  // Check if payment can be accepted
  if (!this.canAcceptPayment()) {
    return {
      principalPaid: 0,
      interestPaid: 0,
      excessAmount: amount,
      wasBlocked: true,
      blockReason: this.isPaid 
        ? "Installment already paid" 
        : "Payment attempt too soon after previous attempt"
    };
  }

  // Record payment attempt
  this.recordPaymentAttempt();

  // CRITICAL FIX: Ensure all values are numbers, not strings
  let remainingAmount = Number(amount);
  let principalPaid = 0;
  let interestPaid = 0;

  // Convert database decimal values to numbers explicitly
  const currentPaidInterest = Number(this.paidInterest) || 0;
  const currentPaidPrincipal = Number(this.paidPrincipal) || 0;
  const currentPaidTotal = Number(this.paidTotal) || 0;
  
  const dueInterest = Number(this.dueInterest) || 0;
  const duePrincipal = Number(this.duePrincipal) || 0;
  const dueTotal = Number(this.dueTotal) || 0;

  console.log('=== PAYMENT APPLICATION DEBUG ===');
  console.log('Before payment:', {
    currentPaidInterest,
    currentPaidPrincipal,
    currentPaidTotal,
    dueInterest,
    duePrincipal,
    dueTotal,
    remainingAmount
  });

  // First pay outstanding interest
  const interestDue = dueInterest - currentPaidInterest;
  if (interestDue > 0 && remainingAmount > 0) {
    interestPaid = Math.min(interestDue, remainingAmount);
    remainingAmount = remainingAmount - interestPaid;
  }

  // Then pay outstanding principal
  const principalDue = duePrincipal - currentPaidPrincipal;
  if (principalDue > 0 && remainingAmount > 0) {
    principalPaid = Math.min(principalDue, remainingAmount);
    remainingAmount = remainingAmount - principalPaid;
  }

  // CRITICAL FIX: Use arithmetic addition, not concatenation
  this.paidInterest = Number((currentPaidInterest + interestPaid).toFixed(2));
  this.paidPrincipal = Number((currentPaidPrincipal + principalPaid).toFixed(2));
  
  const totalPayment = Number((principalPaid + interestPaid).toFixed(2));
  this.paidTotal = Number((currentPaidTotal + totalPayment).toFixed(2));

  console.log('After payment:', {
    paidInterest: this.paidInterest,
    paidPrincipal: this.paidPrincipal,
    paidTotal: this.paidTotal,
    principalPaid,
    interestPaid,
    totalPayment
  });
  
  // Update payment tracking if payment date provided
  if (paymentDate) {
    this.updateDelayedDaysOnPayment(paymentDate);
    
    // CRITICAL FIX: Check if fully paid with proper number comparison
    const paidTotalNum = Number(this.paidTotal);
    const dueTotalNum = Number(this.dueTotal);
    
    console.log('Checking if paid:', {
      paidTotalNum,
      dueTotalNum,
      difference: dueTotalNum - paidTotalNum,
      willMarkAsPaid: paidTotalNum >= dueTotalNum
    });
    
    if (paidTotalNum >= dueTotalNum) {
      this.markAsPaid(paymentDate);
      console.log('✓ Installment marked as PAID');
    }
  }
  
  // Update status based on payments
  this.updateStatus();
  
  console.log('Final status:', {
    status: this.status,
    paymentStatus: this.paymentStatus,
    isPaid: this.isPaid
  });
  console.log('=== PAYMENT APPLICATION END ===');

  return {
    principalPaid: Number(principalPaid.toFixed(2)),
    interestPaid: Number(interestPaid.toFixed(2)),
    excessAmount: Number(remainingAmount.toFixed(2)),
    wasBlocked: false
  };
}
  /**
   * Get payment status display information
   */
  getPaymentStatusInfo(): {
    status: PaymentStatus;
    isPaid: boolean;
    canAcceptPayment: boolean;
    daysDelayed: number;
    statusColor: 'green' | 'yellow' | 'red' | 'gray';
    statusLabel: string;
  } {
    let statusColor: 'green' | 'yellow' | 'red' | 'gray' = 'gray';
    let statusLabel = 'Pending';

    if (this.isPaid) {
      statusColor = 'green';
      statusLabel = 'Paid';
    } else if (this.paymentStatus === PaymentStatus.PARTIAL) {
      statusColor = 'yellow';
      statusLabel = 'Partial';
    } else if (this.paymentStatus === PaymentStatus.OVERDUE) {
      statusColor = 'red';
      statusLabel = 'Overdue';
    }

    return {
      status: this.paymentStatus,
      isPaid: this.isPaid,
      canAcceptPayment: this.canAcceptPayment(),
      daysDelayed: this.delayedDays,
      statusColor,
      statusLabel
    };
  }
}