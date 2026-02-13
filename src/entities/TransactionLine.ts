import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Transaction } from "./Transaction";
import { Account } from "./Account";

export enum LineType {
  DEBIT = "debit",
  CREDIT = "credit"
}

@Entity("transaction_lines")
@Index(["transactionId"])
@Index(["accountId"])
@Index(["lineType"])
export class TransactionLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  transactionId: number;

  @Column({ type: "int" })
  accountId: number;

  @Column({
    type: "enum",
    enum: LineType
  })
  lineType: LineType;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  amount: number;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  vatRate: number | null;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  vatAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => Transaction, (transaction) => transaction.transactionLines, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "transactionId" })
  transaction: Transaction;

  @ManyToOne(() => Account, (account) => account.transactionLines, {
    onDelete: "RESTRICT"
  })
  @JoinColumn({ name: "accountId" })
  account: Account;

  // Business Methods
  calculateVAT(rate: number): number {
    const amountNum = Number(this.amount) || 0;
    const rateNum = Number(rate) || 0;
    
    const vatAmount = (amountNum * rateNum) / 100;
    return Number(vatAmount.toFixed(2));
  }

  getAmountWithVAT(): number {
    const amountNum = Number(this.amount) || 0;
    const vatNum = Number(this.vatAmount) || 0;
    
    return Number((amountNum + vatNum).toFixed(2));
  }

  isDebit(): boolean {
    return this.lineType === LineType.DEBIT;
  }

  isCredit(): boolean {
    return this.lineType === LineType.CREDIT;
  }

  getSignedAmount(): number {
    const amountNum = Number(this.amount) || 0;
    return this.lineType === LineType.DEBIT ? amountNum : -amountNum;
  }
}