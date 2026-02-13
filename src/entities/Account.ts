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

export enum AccountType {
  ASSET = "asset",
  LIABILITY = "liability",
  CAPITAL = "capital",
  REVENUE = "revenue",
  EXPENSE = "expense"
}

export enum NormalBalance {
  DEBIT = "debit",
  CREDIT = "credit"
}

@Entity("accounts")
@Index(["organizationId", "accountCode"], { unique: true })
@Index(["accountType"])
@Index(["isActive"])
export class Account {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "accountcode", type: "varchar", length: 50 })
  accountCode: string;

  @Column({ type: "varchar", length: 255 })
  accountName: string;

  @Column({
    type: "enum",
    enum: AccountType
  })
  accountType: AccountType;

  @Column({ type: "varchar", length: 255 })
  accountCategory: string;

  @Column({ type: "int", nullable: true })
  parentAccountId: number | null;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({
    type: "enum",
    enum: NormalBalance
  })
  normalBalance: NormalBalance;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Organization, (organization) => organization.accounts, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @ManyToOne(() => Account, (account) => account.childAccounts, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "parentAccountId" })
  parentAccount: Account | null;

  @OneToMany(() => Account, (account) => account.parentAccount)
  childAccounts: Account[];

  @OneToMany(() => TransactionLine, (line) => line.account)
  transactionLines: TransactionLine[];

  // Business Methods - ENHANCED FOR UNLIMITED ACCOUNTS
  static getAccountCodeRange(accountType: AccountType): { start: number; end: number } {
    // Massively expanded ranges to support unlimited growth
    const ranges = {
      [AccountType.ASSET]: { start: 100, end: 199999 },       // 99,900 accounts
      [AccountType.LIABILITY]: { start: 200, end: 299999 },   // 99,800 accounts
      [AccountType.CAPITAL]: { start: 300, end: 399999 },     // 99,700 accounts
      [AccountType.REVENUE]: { start: 400, end: 499999 },     // 99,600 accounts
      [AccountType.EXPENSE]: { start: 500, end: 599999 }      // 99,500 accounts
    };
    return ranges[accountType];
  }

  static getCategoryRange(accountType: AccountType, accountCategory: string): { start: number; end: number } {
    // Enhanced category ranges with much larger capacity
    if (accountType === AccountType.ASSET) {
      if (accountCategory.toLowerCase().includes("non-current") || 
          accountCategory.toLowerCase().includes("fixed")) {
        return { start: 100, end: 149999 };   // 49,900 accounts for fixed assets
      }
      return { start: 150, end: 199999 };     // 49,850 accounts for current assets
    }
    
    if (accountType === AccountType.LIABILITY) {
      if (accountCategory.toLowerCase().includes("current")) {
        return { start: 200, end: 249999 };   // 49,800 accounts for current liabilities
      }
      return { start: 250, end: 299999 };     // 49,750 accounts for non-current liabilities
    }
    
    // For Capital, Revenue, Expense - use full type range
    return this.getAccountCodeRange(accountType);
  }

  static determineNormalBalance(accountType: AccountType): NormalBalance {
    if (accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) {
      return NormalBalance.DEBIT;
    }
    return NormalBalance.CREDIT; // LIABILITY, CAPITAL, REVENUE
  }

  updateBalance(amount: number, isDebit: boolean): void {
    const amountNum = Number(amount);
    const currentBalance = Number(this.balance) || 0;

    if (this.normalBalance === NormalBalance.DEBIT) {
      this.balance = isDebit 
        ? Number((currentBalance + amountNum).toFixed(2))
        : Number((currentBalance - amountNum).toFixed(2));
    } else {
      this.balance = isDebit 
        ? Number((currentBalance - amountNum).toFixed(2))
        : Number((currentBalance + amountNum).toFixed(2));
    }
  }

  getBalanceDisplay(): { amount: number; type: 'Dr' | 'Cr' } {
    const balanceNum = Number(this.balance) || 0;
    
    if (balanceNum === 0) {
      return { 
        amount: 0, 
        type: this.normalBalance === NormalBalance.DEBIT ? 'Dr' : 'Cr' 
      };
    }

    if (this.normalBalance === NormalBalance.DEBIT) {
      return balanceNum >= 0 
        ? { amount: balanceNum, type: 'Dr' }
        : { amount: Math.abs(balanceNum), type: 'Cr' };
    } else {
      return balanceNum >= 0 
        ? { amount: balanceNum, type: 'Cr' }
        : { amount: Math.abs(balanceNum), type: 'Dr' };
    }
  }

  isBalanceNormal(): boolean {
    const balanceNum = Number(this.balance) || 0;
    return balanceNum >= 0;
  }
}