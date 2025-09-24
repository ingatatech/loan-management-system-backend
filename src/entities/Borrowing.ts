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

  getPaymentProgress(): number {
    const totalRepayment = this.calculateTotalRepayment();
    return totalRepayment > 0 ? (this.amountPaid / totalRepayment) * 100 : 0;
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

  updateOutstandingBalance(): void {
    this.outstandingBalance = this.calculateTotalRepayment() - this.amountPaid;
  }

  canBeRestructured(): boolean {
    return this.status === BorrowingStatus.ACTIVE && this.getPaymentProgress() > 0;
  }
}