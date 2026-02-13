import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from "typeorm";
import { Loan } from "./Loan";
import { RepaymentSchedule } from "./RepaymentSchedule";
import { BorrowerProfile } from "./BorrowerProfile";

@Entity("repayment_reminders")
@Index(["scheduleId", "reminderType"], { unique: true })
@Index(["loanId"])
@Index(["sentAt"])
export class RepaymentReminder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  scheduleId: number;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "int", nullable: true })
  borrowerId: number | null;

  @Column({ type: "varchar", length: 20 })
  reminderType: string; // '7-day', '3-day', '1-day', 'overdue'

  @Column({ type: "timestamp" })
  sentAt: Date;

  @Column({ type: "varchar", length: 20 })
  phoneNumber: string;

  @Column({ type: "text" })
  messageContent: string;

  @Column({ type: "varchar", length: 20, default: 'sent' })
  deliveryStatus: string; // 'sent', 'failed', 'delivered'

  @Column({ type: "varchar", length: 100, nullable: true })
  twilioSid: string | null;

  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => RepaymentSchedule)
  @JoinColumn({ name: "scheduleId" })
  schedule: RepaymentSchedule;

  @ManyToOne(() => Loan)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @ManyToOne(() => BorrowerProfile, { nullable: true })
  @JoinColumn({ name: "borrowerId" })
  borrower: BorrowerProfile | null;
}