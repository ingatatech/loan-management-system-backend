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

export enum GrantStatus {
  PENDING = "pending",
  APPROVED = "approved",
  DISBURSED = "disbursed",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  SUSPENDED = "suspended",
}

export enum GrantType {
  DEVELOPMENT = "development",
  EMERGENCY = "emergency",
  CAPACITY_BUILDING = "capacity_building",
  INFRASTRUCTURE = "infrastructure",
  RESEARCH = "research",
  EDUCATIONAL = "educational",
  HEALTHCARE = "healthcare",
  OTHER = "other",
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

interface GrantCondition {
  condition: string;
  description: string;
  dueDate?: Date;
  isCompleted: boolean;
  completedDate?: Date;
  evidenceUrl?: string;
  notes?: string;
}

interface Milestone {
  milestoneNumber: number;
  title: string;
  description: string;
  targetDate: Date;
  completionDate?: Date;
  isCompleted: boolean;
  budgetAllocation: number;
  actualSpent?: number;
  evidenceUrls?: string[];
  notes?: string;
}

@Entity("granted_funds")
export class GrantedFunds {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  grantorName: string;

  @Column("jsonb", { nullable: true })
  grantorAddress: Address | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  grantorPhone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  grantorEmail: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  grantorWebsite: string | null;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  amountGranted: number;

  @Column({ type: "text" })
  grantPurpose: string;

  @Column({
    type: "enum",
    enum: GrantType,
    default: GrantType.DEVELOPMENT,
  })
  grantType: GrantType;

  @Column("jsonb")
  grantConditions: GrantCondition[];

  @Column("jsonb", { nullable: true })
  milestones: Milestone[] | null;

  @Column({ type: "date" })
  grantDate: Date;

  @Column({ type: "date", nullable: true })
  disbursementDate: Date | null;

  @Column({ type: "date" })
  projectStartDate: Date;

  @Column({ type: "date" })
  projectEndDate: Date;

  @Column({
    type: "enum",
    enum: GrantStatus,
    default: GrantStatus.PENDING,
  })
  status: GrantStatus;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  amountDisbursed: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  amountUtilized: number;

  @Column({ type: "text", nullable: true })
  grantAgreementUrl: string | null;

  @Column({ type: "text", nullable: true })
  projectProposalUrl: string | null;

  @Column("text", { array: true, nullable: true })
  reportingDocuments: string[] | null;

  @Column("text", { array: true, nullable: true })
  complianceDocuments: string[] | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "boolean", default: false })
  requiresReporting: boolean;

  @Column({ type: "varchar", length: 50, nullable: true })
  reportingFrequency: string | null; // monthly, quarterly, annually

  @Column({ type: "date", nullable: true })
  nextReportDue: Date | null;

  @ManyToOne(() => Organization, (organization) => organization.grantedFunds, {
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
  getUtilizationPercentage(): number {
    return this.amountDisbursed > 0 ? (this.amountUtilized / this.amountDisbursed) * 100 : 0;
  }

  getDisbursementPercentage(): number {
    return this.amountGranted > 0 ? (this.amountDisbursed / this.amountGranted) * 100 : 0;
  }

  getRemainingAmount(): number {
    return this.amountDisbursed - this.amountUtilized;
  }

  getDaysUntilProjectEnd(): number {
    const today = new Date();
    const endDate = new Date(this.projectEndDate);
    const diffTime = endDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isProjectActive(): boolean {
    const today = new Date();
    const startDate = new Date(this.projectStartDate);
    const endDate = new Date(this.projectEndDate);
    return today >= startDate && today <= endDate;
  }

  isProjectOverdue(): boolean {
    return this.getDaysUntilProjectEnd() < 0 && this.status !== GrantStatus.COMPLETED;
  }

  getCompletedConditionsCount(): number {
    return this.grantConditions.filter(condition => condition.isCompleted).length;
  }

  getCompliancePercentage(): number {
    if (this.grantConditions.length === 0) return 100;
    return (this.getCompletedConditionsCount() / this.grantConditions.length) * 100;
  }

  getCompletedMilestonesCount(): number {
    return this.milestones?.filter(milestone => milestone.isCompleted).length || 0;
  }

  getMilestoneProgress(): number {
    if (!this.milestones || this.milestones.length === 0) return 100;
    return (this.getCompletedMilestonesCount() / this.milestones.length) * 100;
  }

  getNextMilestone(): Milestone | null {
    if (!this.milestones) return null;
    const pending = this.milestones.filter(m => !m.isCompleted);
    if (pending.length === 0) return null;
    return pending.sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())[0];
  }

  isReportingDue(): boolean {
    if (!this.requiresReporting || !this.nextReportDue) return false;
    return new Date() >= new Date(this.nextReportDue);
  }

  canBeExtended(): boolean {
    return this.status === GrantStatus.APPROVED && this.getCompliancePercentage() >= 80;
  }

  addMilestone(milestone: Milestone): void {
    if (!this.milestones) {
      this.milestones = [];
    }
    this.milestones.push(milestone);
  }

  completeMilestone(milestoneNumber: number, completionDate: Date, evidenceUrls?: string[]): boolean {
    if (!this.milestones) return false;
    
    const milestone = this.milestones.find(m => m.milestoneNumber === milestoneNumber);
    if (milestone && !milestone.isCompleted) {
      milestone.isCompleted = true;
      milestone.completionDate = completionDate;
      if (evidenceUrls) {
        milestone.evidenceUrls = evidenceUrls;
      }
      return true;
    }
    return false;
  }
}