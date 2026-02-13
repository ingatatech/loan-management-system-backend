import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Organization } from "./Organization";

export enum LenderType {
  BANK = "bank",
  FINANCIAL_INSTITUTION = "financial_institution",
  MICROFINANCE = "microfinance",
  PRIVATE_LENDER = "private_lender",
  GOVERNMENT = "government",
  INTERNATIONAL_ORGANIZATION = "international_organization",
  OTHER = "other",
}

export enum BorrowingStatus {
  ACTIVE = "active",
  FULLY_PAID = "fully_paid",
  DEFAULTED = "defaulted",
  RESTRUCTURED = "restructured",
  WRITTEN_OFF = "written_off",
}

interface Address {
  country?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  street?: string;
  houseNumber?: string;
  poBox?: string;
}

interface PaymentScheduleItem {
  installmentNumber: number;
  dueDate: Date;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  isPaid: boolean;
  paidDate?: Date;
  paidAmount?: number;
  lateFee?: number;
}

@Entity("borrowings")
export class Borrowing {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "enum",
    enum: LenderType,
  })
  lenderType: LenderType;

  @Column({ type: "varchar", length: 255 })
  lenderName: string;

  @Column("jsonb", { nullable: true })
  lenderAddress: Address | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  lenderPhone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  lenderEmail: string | null;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  amountBorrowed: number;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  interestRate: number;

  @Column({ type: "int" })
  tenureMonths: number;

  @Column({ type: "date" })
  borrowingDate: Date;

  @Column({ type: "date" })
  maturityDate: Date;

  @Column("jsonb")
  paymentSchedule: PaymentScheduleItem[];

  @Column({
    type: "enum",
    enum: BorrowingStatus,
    default: BorrowingStatus.ACTIVE,
  })
  status: BorrowingStatus;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  outstandingBalance: number;

  @Column({ type: "text", nullable: true })
  purpose: string | null;

  @Column({ type: "text", nullable: true })
  collateralDescription: string | null;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  collateralValue: number | null;

  @Column({ type: "text", nullable: true })
  loanAgreementUrl: string | null;

  @Column({ type: "text", nullable: true })
  collateralDocumentUrl: string | null;

  @Column("text", { array: true, nullable: true })
  additionalDocuments: string[] | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column("jsonb", {
    nullable: true,
    default: () => "'[]'::jsonb"
  })
  repaymentHistory: Array<{
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    paymentReference: string;
    interestAmount: string
    notes?: string;
    recordedAt: Date;
  }> | null;

  @ManyToOne(() => Organization, (organization) => organization.borrowings, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @Column({ name: "organization_id" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Business methods
  calculateTotalInterest(): number {
    return (this.amountBorrowed * this.interestRate * this.tenureMonths) / (100 * 12);
  }

  calculateTotalRepayment(): number {
    return this.amountBorrowed + this.calculateTotalInterest();
  }

  calculateMonthlyPayment(): number {
    const monthlyInterestRate = this.interestRate / (100 * 12);
    const numerator = this.amountBorrowed * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, this.tenureMonths);
    const denominator = Math.pow(1 + monthlyInterestRate, this.tenureMonths) - 1;
    return numerator / denominator;
  }

  // SIMPLIFIED: Progress based on principal reduction only
  getPaymentProgress(): number {
    const amountBorrowed = Number(this.amountBorrowed) || 0;
    const amountPaid = Number(this.amountPaid) || 0;
    return amountBorrowed > 0 ? (amountPaid / amountBorrowed) * 100 : 100;
  }

  getDaysUntilMaturity(): number {
    const today = new Date();
    const maturity = new Date(this.maturityDate);
    const diffTime = maturity.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isOverdue(): boolean {
    return this.getDaysUntilMaturity() < 0 && this.status === BorrowingStatus.ACTIVE;
  }

  getOverdueDays(): number {
    if (!this.isOverdue()) return 0;
    return Math.abs(this.getDaysUntilMaturity());
  }

  getPaidInstallments(): PaymentScheduleItem[] {
    return this.paymentSchedule.filter(item => item.isPaid);
  }

  getPendingInstallments(): PaymentScheduleItem[] {
    return this.paymentSchedule.filter(item => !item.isPaid);
  }

  getNextPaymentDue(): PaymentScheduleItem | null {
    const pending = this.getPendingInstallments();
    if (pending.length === 0) return null;
    return pending.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  }

  // SIMPLIFIED: Update outstanding balance based on simple formula
  updateOutstandingBalance(): void {
    const amountBorrowed = Number(this.amountBorrowed) || 0;
    const amountPaid = Number(this.amountPaid) || 0;
    this.outstandingBalance = Math.max(0, amountBorrowed - amountPaid);
  }

  canBeRestructured(): boolean {
    return this.status === BorrowingStatus.ACTIVE && this.getPaymentProgress() > 0;
  }

  getTotalRepaid(): number {
    if (!this.repaymentHistory || this.repaymentHistory.length === 0) {
      return Number(this.amountPaid) || 0;
    }

    return this.repaymentHistory.reduce((total, repayment) => total + repayment.amount, 0);
  }

  addRepaymentToHistory(repayment: {
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    paymentReference: string;
    interestAmount: string;
    notes?: string;
  }): void {
    if (!this.repaymentHistory) {
      this.repaymentHistory = [];
    }

    this.repaymentHistory.push({
      ...repayment,
      recordedAt: new Date()
    });
  }

  // Check if repayment can be accepted
  canAcceptRepayment(amount: number): boolean {
    const amountBorrowed = Number(this.amountBorrowed) || 0;
    const amountPaid = Number(this.amountPaid) || 0;
    const remainingPrincipal = amountBorrowed - amountPaid;
    return amount > 0 && amount <= remainingPrincipal;
  }

  // Apply repayment to principal
  applyRepayment(amount: number): void {
    const currentAmountPaid = Number(this.amountPaid) || 0;
    this.amountPaid = currentAmountPaid + amount;
    this.updateOutstandingBalance();
    
    // Update status if fully paid
    if (this.outstandingBalance <= 0) {
      this.status = BorrowingStatus.FULLY_PAID;
    }
  }
}