import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Loan } from "./Loan";
import { RepaymentSchedule } from "./RepaymentSchedule";

export enum PaymentMethod {
  CASH = "cash",
  BANK_TRANSFER = "bank_transfer",
  MOBILE_MONEY = "mobile_money",
  CHECK = "check",
  CARD = "card"
}

@Entity("repayment_transactions")
@Index(["loanId"])
@Index(["scheduleId"])
@Index(["paymentDate"])
@Index(["transactionId"], { unique: true })
export class RepaymentTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  transactionId: string;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "int" })
  scheduleId: number;

  @Column({ type: "date" })
  paymentDate: Date;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  amountPaid: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  principalPaid: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  interestPaid: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  penaltyPaid: number;

  @Column({
    type: "enum",
    enum: PaymentMethod,
    default: PaymentMethod.CASH
  })
  paymentMethod: PaymentMethod;

  @Column({ type: "varchar", length: 100, nullable: true })
  repaymentProof: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  receivedBy: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  approvedBy: string | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => Loan, (loan) => loan.transactions)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @ManyToOne(() => RepaymentSchedule, (schedule) => schedule.transactions)
  @JoinColumn({ name: "scheduleId" })
  schedule: RepaymentSchedule;

  // Business methods
  isValidTransaction(): boolean {
    return this.isActive && this.amountPaid > 0 && (this.principalPaid + this.interestPaid + this.penaltyPaid) === this.amountPaid;
  }
}