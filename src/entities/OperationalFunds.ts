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

  @Column({ type: "decimal", precision: 15, scale: 2 })
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

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  amountUtilized: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
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

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  monthlyBurnRate: number | null;

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

  // Business methods
  getAvailableAmount(): number {
    return this.amountCommitted - this.amountUtilized - this.amountReserved;
  }

  getUtilizationPercentage(): number {
    return this.amountCommitted > 0 ? (this.amountUtilized / this.amountCommitted) * 100 : 0;
  }

  getReservationPercentage(): number {
    return this.amountCommitted > 0 ? (this.amountReserved / this.amountCommitted) * 100 : 0;
  }

  getDaysUntilExpiration(): number | null {
    if (!this.expirationDate) return null;
    const today = new Date();
    const expiration = new Date(this.expirationDate);
    const diffTime = expiration.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isExpired(): boolean {
    const daysUntilExpiration = this.getDaysUntilExpiration();
    return daysUntilExpiration !== null && daysUntilExpiration < 0;
  }

  isNearExpiration(warningDays: number = 30): boolean {
    const daysUntilExpiration = this.getDaysUntilExpiration();
    return daysUntilExpiration !== null && daysUntilExpiration <= warningDays && daysUntilExpiration > 0;
  }

  canUtilize(amount: number): boolean {
    return this.getAvailableAmount() >= amount && this.status === FundStatus.AVAILABLE && !this.isExpired();
  }

  utilizeFund(amount: number, utilizationDate: Date = new Date()): boolean {
    if (!this.canUtilize(amount)) return false;
    
    this.amountUtilized += amount;
    this.updateStatus();
    return true;
  }

  reserveFund(amount: number): boolean {
    if (this.getAvailableAmount() < amount) return false;
    
    this.amountReserved += amount;
    return true;
  }

  releaseReservation(amount: number): boolean {
    if (this.amountReserved < amount) return false;
    
    this.amountReserved -= amount;
    return true;
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

  getCompletedUtilizationPlans(): UtilizationPlan[] {
    return this.utilizationPlan.filter(plan => plan.isCompleted);
  }

  getPendingUtilizationPlans(): UtilizationPlan[] {
    return this.utilizationPlan.filter(plan => !plan.isCompleted);
  }

  getTotalBudgetAllocated(): number {
    return this.budgetAllocations?.reduce((total, allocation) => total + allocation.allocatedAmount, 0) || 0;
  }

  getTotalBudgetSpent(): number {
    return this.budgetAllocations?.reduce((total, allocation) => total + allocation.actualSpent, 0) || 0;
  }

  getBudgetUtilizationPercentage(): number {
    const totalAllocated = this.getTotalBudgetAllocated();
    const totalSpent = this.getTotalBudgetSpent();
    return totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;
  }

  addBudgetAllocation(allocation: BudgetAllocation): void {
    if (!this.budgetAllocations) {
      this.budgetAllocations = [];
    }
    this.budgetAllocations.push({
      ...allocation,
      remainingBalance: allocation.allocatedAmount - allocation.actualSpent,
      utilizationPercentage: allocation.allocatedAmount > 0 ? (allocation.actualSpent / allocation.allocatedAmount) * 100 : 0,
    });
  }

  getEstimatedRunwayDays(): number | null {
    if (!this.monthlyBurnRate || this.monthlyBurnRate <= 0) return null;
    const availableAmount = this.getAvailableAmount();
    return Math.floor((availableAmount / this.monthlyBurnRate) * 30);
  }

  updateMonthlyBurnRate(): void {
    if (this.amountUtilized > 0) {
      const daysSinceCommitment = Math.floor((Date.now() - this.commitmentDate.getTime()) / (1000 * 60 * 60 * 24));
      const monthsSinceCommitment = daysSinceCommitment / 30;
      if (monthsSinceCommitment > 0) {
        this.monthlyBurnRate = this.amountUtilized / monthsSinceCommitment;
      }
    }
  }
}