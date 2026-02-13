import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeUpdate,
  BeforeInsert
} from "typeorm";
import { Organization } from "./Organization";

export enum FundSource {
  RETAINED_EARNINGS = "retained_earnings",
  CAPITAL_INJECTION = "capital_injection",
  REVENUE = "revenue",
  INVESTMENT = "investment",
  LOAN_PROCEEDS = "loan_proceeds",
  GRANT = "grant",
  GOVERNMENT_SUPPORT = "government_support",
  DONOR_FUNDING = "donor_funding",
  OTHER = "other",
}

export enum FundStatus {
  COMMITTED = "committed",
  AVAILABLE = "available",
  PARTIALLY_UTILIZED = "partially_utilized",
  FULLY_UTILIZED = "fully_utilized",
  FROZEN = "frozen",
  EXPIRED = "expired",
}

export enum OperationalHistoryType {
  INJECTION = "injection",
  WITHDRAWAL = "withdrawal"
}

interface UtilizationPlan {
  category: string;
  description: string;
  allocatedAmount: number;
  utilizationPeriod: {
    startDate: Date;
    endDate: Date;
  };
  priority: number;
  isCompleted: boolean;
  actualUtilized?: number;
  utilizationDate?: Date;
  notes?: string;
}

interface BudgetAllocation {
  department: string;
  allocatedAmount: number;
  approvedBy: string;
  approvalDate: Date;
  utilizationDeadline: Date;
  actualSpent: number;
  remainingBalance: number;
  utilizationPercentage: number;
}

// NEW: Operational History Interface
interface OperationalHistory {
  id?: number;
  date: Date;
  type: OperationalHistoryType;
  amountInjected?: number;
  amountWithdrawn?: number;
  description: string;
  transactionReference?: string;
  performedBy?: number;
  performedByName?: string;
  previousAmountCommitted: number;
  newAmountCommitted: number;
  previousAmountUtilized: number;
  newAmountUtilized: number;
  previousStatus: FundStatus;
  newStatus: FundStatus;
  notes?: string;
  createdAt?: Date;
}

@Entity("operational_funds")
export class OperationalFunds {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "enum",
    enum: FundSource,
  })
  fundSource: FundSource;

  @Column({ type: "varchar", length: 255, nullable: true })
  fundSourceDescription: string | null;

  @Column({ 
    type: "decimal", 
    precision: 15, 
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value)
    }
  })
  amountCommitted: number;

  @Column({ type: "date" })
  commitmentDate: Date;

  @Column({ type: "date", nullable: true })
  availabilityDate: Date | null;

  @Column({ type: "date", nullable: true })
  expirationDate: Date | null;

  @Column("jsonb")
  utilizationPlan: UtilizationPlan[];

  @Column("jsonb", { nullable: true })
  budgetAllocations: BudgetAllocation[] | null;

  @Column({
    type: "enum",
    enum: FundStatus,
    default: FundStatus.COMMITTED,
  })
  status: FundStatus;

  @Column({ 
    type: "decimal", 
    precision: 15, 
    scale: 2, 
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value)
    }
  })
  amountUtilized: number;

  @Column({ 
    type: "decimal", 
    precision: 15, 
    scale: 2, 
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value)
    }
  })
  amountReserved: number;

  @Column({ type: "text", nullable: true })
  purpose: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  approvedBy: string | null;

  @Column({ type: "date", nullable: true })
  approvalDate: Date | null;

  @Column({ type: "text", nullable: true })
  fundingAgreementUrl: string | null;

  @Column({ type: "text", nullable: true })
  budgetDocumentUrl: string | null;

  @Column("text", { array: true, nullable: true })
  utilizationReports: string[] | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "boolean", default: false })
  requiresApproval: boolean;

  @Column({ 
    type: "decimal", 
    precision: 15, 
    scale: 2, 
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => value ? parseFloat(value) : null
    }
  })
  monthlyBurnRate: number | null;

  // NEW: Operational History Array
  @Column({ type: "jsonb", default: [] })
  operationalHistory: OperationalHistory[];

  @ManyToOne(() => Organization, (organization) => organization.operationalFunds, {
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

  @BeforeInsert()
  @BeforeUpdate()
  normalizeDecimalFields() {
    // Ensure all decimal fields are properly converted to numbers
    this.amountCommitted = this.toDecimal(this.amountCommitted);
    this.amountUtilized = this.toDecimal(this.amountUtilized);
    this.amountReserved = this.toDecimal(this.amountReserved);
    if (this.monthlyBurnRate !== null && this.monthlyBurnRate !== undefined) {
      this.monthlyBurnRate = this.toDecimal(this.monthlyBurnRate);
    }
  }

  private toDecimal(value: any): number {
    if (value === null || value === undefined) return 0;
    
    // Convert to number
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    
    // Round to 2 decimal places to avoid floating point issues
    return parseFloat(num.toFixed(2));
  }

  // NEW: Add injection method with proper decimal handling
  addInjection(
    amount: number,
    description: string,
    performedBy?: number,
    performedByName?: string,
    transactionReference?: string,
    notes?: string
  ): OperationalHistory {
    const injectedAmount = this.toDecimal(amount);
    
    if (injectedAmount <= 0) {
      throw new Error("Injection amount must be positive");
    }

    const previousAmountCommitted = this.toDecimal(this.amountCommitted);
    const previousAmountUtilized = this.toDecimal(this.amountUtilized);
    const previousStatus = this.status;

    // Calculate new committed amount with proper arithmetic
    const newAmountCommitted = previousAmountCommitted + injectedAmount;

    // Update the committed amount
    this.amountCommitted = newAmountCommitted;

    // Update status
    this.updateStatus();

    const historyEntry: OperationalHistory = {
      date: new Date(),
      type: OperationalHistoryType.INJECTION,
      amountInjected: injectedAmount,
      description,
      transactionReference,
      performedBy,
      performedByName,
      previousAmountCommitted,
      newAmountCommitted,
      previousAmountUtilized,
      newAmountUtilized: this.amountUtilized,
      previousStatus,
      newStatus: this.status,
      notes,
      createdAt: new Date()
    };

    if (!this.operationalHistory) {
      this.operationalHistory = [];
    }

    this.operationalHistory.push(historyEntry);
    return historyEntry;
  }

  // NEW: Add withdrawal method with proper decimal handling
  addWithdrawal(
    amount: number,
    description: string,
    performedBy?: number,
    performedByName?: string,
    transactionReference?: string,
    notes?: string
  ): OperationalHistory {
    const withdrawnAmount = this.toDecimal(amount);
    
    if (withdrawnAmount <= 0) {
      throw new Error("Withdrawal amount must be positive");
    }

    // Check available funds
    const availableAmount = this.getAvailableAmount();
    if (withdrawnAmount > availableAmount) {
      throw new Error(`Insufficient funds. Available: ${availableAmount}, Requested: ${withdrawnAmount}`);
    }

    const previousAmountCommitted = this.toDecimal(this.amountCommitted);
    const previousAmountUtilized = this.toDecimal(this.amountUtilized);
    const previousStatus = this.status;

    // Calculate new committed amount with proper arithmetic
    const newAmountCommitted = previousAmountCommitted - withdrawnAmount;

    // Update the committed amount
    this.amountCommitted = newAmountCommitted;

    // Update status
    this.updateStatus();

    const historyEntry: OperationalHistory = {
      date: new Date(),
      type: OperationalHistoryType.WITHDRAWAL,
      amountWithdrawn: withdrawnAmount,
      description,
      transactionReference,
      performedBy,
      performedByName,
      previousAmountCommitted,
      newAmountCommitted,
      previousAmountUtilized,
      newAmountUtilized: this.amountUtilized,
      previousStatus,
      newStatus: this.status,
      notes,
      createdAt: new Date()
    };

    if (!this.operationalHistory) {
      this.operationalHistory = [];
    }

    this.operationalHistory.push(historyEntry);
    return historyEntry;
  }

  // Get available amount with proper decimal handling
  getAvailableAmount(): number {
    const committed = this.toDecimal(this.amountCommitted);
    const utilized = this.toDecimal(this.amountUtilized);
    const reserved = this.toDecimal(this.amountReserved);
    return Math.max(0, committed - utilized - reserved);
  }

  getUtilizationPercentage(): number {
    const committed = this.toDecimal(this.amountCommitted);
    const utilized = this.toDecimal(this.amountUtilized);
    return committed > 0 ? (utilized / committed) * 100 : 0;
  }

  private updateStatus(): void {
    if (this.isExpired()) {
      this.status = FundStatus.EXPIRED;
    } else if (this.amountUtilized >= this.amountCommitted) {
      this.status = FundStatus.FULLY_UTILIZED;
    } else if (this.amountUtilized > 0) {
      this.status = FundStatus.PARTIALLY_UTILIZED;
    } else {
      this.status = FundStatus.AVAILABLE;
    }
  }

  isExpired(): boolean {
    if (!this.expirationDate) return false;
    const today = new Date();
    const expiration = new Date(this.expirationDate);
    return today > expiration;
  }

  // Get total injections from history
  getTotalInjections(): number {
    if (!this.operationalHistory || this.operationalHistory.length === 0) return 0;
    
    return this.operationalHistory
      .filter(entry => entry.type === OperationalHistoryType.INJECTION)
      .reduce((sum, entry) => sum + this.toDecimal(entry.amountInjected || 0), 0);
  }

  // Get total withdrawals from history
  getTotalWithdrawals(): number {
    if (!this.operationalHistory || this.operationalHistory.length === 0) return 0;
    
    return this.operationalHistory
      .filter(entry => entry.type === OperationalHistoryType.WITHDRAWAL)
      .reduce((sum, entry) => sum + this.toDecimal(entry.amountWithdrawn || 0), 0);
  }

  // Get recent history entries
  getRecentHistory(limit: number = 10): OperationalHistory[] {
    if (!this.operationalHistory) return [];
    
    return [...this.operationalHistory]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }
}