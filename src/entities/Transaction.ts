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
import { Organization } from "./Organization";
import { TransactionLine } from "./TransactionLine";

export enum TransactionStatus {
  DRAFT = "draft",
  POSTED = "posted",
  APPROVED = "approved",
  REVERSED = "reversed"
}

export enum VATTransactionType {
  REVENUE = "revenue", // Output VAT - we are credited
  EXPENSE = "expense"  // Input VAT - we are debited
}

@Entity("transactions")
@Index(["organizationId", "transactionCode"], { unique: true })
@Index(["transactionDate"])
@Index(["status"])
@Index(["createdBy"])
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  transactionCode: string;

  @Column({ type: "date" })
  transactionDate: Date;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "varchar", length: 100, nullable: true })
  referenceNumber: string | null;

  @Column({ type: "boolean", default: false })
  isVATApplied: boolean;

  @Column({
    type: "enum",
    enum: VATTransactionType,
    nullable: true
  })
  vatTransactionType: VATTransactionType | null;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalAmount: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  approvedBy: number | null;

  @Column({
    type: "enum",
    enum: TransactionStatus,
    default: TransactionStatus.DRAFT
  })
  status: TransactionStatus;

  @Column({ type: "int", nullable: true })
  reversedTransactionId: number | null;

  @Column({ type: "text", nullable: true })
  reversalReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Organization, (organization) => organization.transactions, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @OneToMany(() => TransactionLine, (line) => line.transaction, {
    cascade: ["insert", "update"]
  })
  transactionLines: TransactionLine[];

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: "reversedTransactionId" })
  reversedTransaction: Transaction | null;

  // Enhanced Business Methods
  validateBalance(): boolean {
    if (!this.transactionLines || this.transactionLines.length < 2) {
      return false;
    }

    const totalDebits = this.transactionLines
      .filter(line => line.lineType === "debit")
      .reduce((sum, line) => sum + Number(line.amount), 0);

    const totalCredits = this.transactionLines
      .filter(line => line.lineType === "credit")
      .reduce((sum, line) => sum + Number(line.amount), 0);

    return Math.abs(totalDebits - totalCredits) < 0.01;
  }

  getTotalDebits(): number {
    if (!this.transactionLines) return 0;
    
    return this.transactionLines
      .filter(line => line.lineType === "debit")
      .reduce((sum, line) => sum + Number(line.amount), 0);
  }

  getTotalCredits(): number {
    if (!this.transactionLines) return 0;
    
    return this.transactionLines
      .filter(line => line.lineType === "credit")
      .reduce((sum, line) => sum + Number(line.amount), 0);
  }

  isBalanced(): boolean {
    const debits = this.getTotalDebits();
    const credits = this.getTotalCredits();
    return Math.abs(debits - credits) < 0.01;
  }

  canBeReversed(): boolean {
    return this.status === TransactionStatus.POSTED || 
           this.status === TransactionStatus.APPROVED;
  }

  isReversed(): boolean {
    return this.status === TransactionStatus.REVERSED;
  }

  getBalanceDifference(): number {
    return Number((this.getTotalDebits() - this.getTotalCredits()).toFixed(2));
  }

  // New: Check if transaction has split entries
  hasSplitDebits(): boolean {
    if (!this.transactionLines) return false;
    return this.transactionLines.filter(line => line.lineType === "debit").length > 1;
  }

  hasSplitCredits(): boolean {
    if (!this.transactionLines) return false;
    return this.transactionLines.filter(line => line.lineType === "credit").length > 1;
  }

  // New: Get split details
  getSplitSummary(): {
    debitLines: Array<{ accountName: string; amount: number }>;
    creditLines: Array<{ accountName: string; amount: number }>;
  } {
    const debitLines = this.transactionLines
      ?.filter(line => line.lineType === "debit")
      .map(line => ({
        accountName: line.account?.accountName || "Unknown",
        amount: Number(line.amount)
      })) || [];

    const creditLines = this.transactionLines
      ?.filter(line => line.lineType === "credit")
      .map(line => ({
        accountName: line.account?.accountName || "Unknown",
        amount: Number(line.amount)
      })) || [];

    return { debitLines, creditLines };
  }
}