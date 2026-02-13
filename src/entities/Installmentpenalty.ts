import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Loan } from "./Loan";
import { RepaymentSchedule } from "./RepaymentSchedule";
import { Organization } from "./Organization";

export enum PenaltyStatus {
  ACTIVE    = "active",   
  WAIVED    = "waived",     
  SETTLED   = "settled",  
}


@Entity("installment_penalties")
@Index(["loanId", "repaymentScheduleId"], { unique: true })
export class InstallmentPenalty {

  @PrimaryGeneratedColumn()
  id: number;

  // ── FK relationships ─────────────────────────────────────────────────────

  @Column()
  @Index()
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column()
  @Index()
  loanId: number;

  @ManyToOne(() => Loan, { onDelete: "CASCADE" })
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @Column()
  @Index()
  repaymentScheduleId: number;

  @ManyToOne(() => RepaymentSchedule, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repaymentScheduleId" })
  repaymentSchedule: RepaymentSchedule;


  @Column("decimal", { precision: 10, scale: 4 })
  dailyInterestRate: number;

  @Column({ type: "date" })
  penaltyStartDate: Date;

  @Column({ type: "date", nullable: true })
  penaltyEndDate: Date | null;


  @Column("decimal", { precision: 15, scale: 2, default: 0 })
  accruedAmount: number;

  @Column("decimal", { precision: 15, scale: 2, default: 0 })
  settledAmount: number;


  @Column("decimal", { precision: 15, scale: 2 })
  penaltyBase: number;

  @Column({ default: 0 })
  daysOverdue: number;

  @Column({
    type: "enum",
    enum: PenaltyStatus,
    default: PenaltyStatus.ACTIVE,
  })
  status: PenaltyStatus;

  @Column({ type: "text", nullable: true })
  waiveReason: string | null;

  @Column({ type: "int", nullable: true })
  createdByUserId: number | null;

  @Column({ type: "int", nullable: true })
  updatedByUserId: number | null;

  @Column({ default: true })
  isActive: boolean;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;


  get dailyPenaltyAmount(): number {
    return (Number(this.penaltyBase) * Number(this.dailyInterestRate)) / 100;
  }

  get outstandingAmount(): number {
    return Math.max(0, Number(this.accruedAmount) - Number(this.settledAmount));
  }
}