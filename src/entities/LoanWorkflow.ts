// @ts-nocheck
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
import { User } from "./User";
import { Organization } from "./Organization";

export enum WorkflowStep {
  LOAN_OFFICER = "loan_officer",
  BOARD_DIRECTOR = "board_director",
  SENIOR_MANAGER = "senior_manager",
  MANAGING_DIRECTOR = "managing_director",
  CREDIT_OFFICER= "credit_officer"
}

export enum WorkflowStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  REJECTED = "rejected"
}

export interface WorkflowHistoryEntry {
  timestamp: Date;
  action: 'created' | 'forwarded' | 'reviewed' | 'approved' | 'rejected' | 'reassigned';
  fromUserId?: number;
  fromUserName?: string;
  fromUserRole?: string;
  toUserId?: number;
  toUserName?: string;
  toUserRole?: string;
  fromStep?: WorkflowStep;
  toStep?: WorkflowStep;
  message?: string;
  decision?: string;
}

@Entity("loan_workflows")
@Index(["currentAssigneeId"])
@Index(["status"])
@Index(["loanId"], { unique: true }) // ✅ FIXED: Kept only unique index for loanId
export class LoanWorkflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "loan_id", type: "int" })
  loanId: number;

  @Column({
    name: "current_step",
    type: "enum",
    enum: WorkflowStep,
    default: WorkflowStep.LOAN_OFFICER
  })
  currentStep: WorkflowStep;

@Column({ name: "current_assignee_id", type: "int", nullable: true })
currentAssigneeId: number | null; 
  @Column({
    type: "enum",
    enum: WorkflowStatus,
    default: WorkflowStatus.PENDING
  })
  status: WorkflowStatus;

  @Column({
    name: "workflow_history",
    type: "jsonb",
    default: []
  })
  workflowHistory: WorkflowHistoryEntry[];

  @Column({ name: "started_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  startedAt: Date;

  @Column({ name: "completed_at", type: "timestamp", nullable: true })
  completedAt: Date | null;

  @Column({ name: "organization_id", type: "int" })
  organizationId: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Loan, { onDelete: "CASCADE" })
  @JoinColumn({ name: "loan_id" })
  loan: Loan;

  @ManyToOne(() => User)
  @JoinColumn({ name: "current_assignee_id" })
  currentAssignee: User;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  // Business Methods (100% UNCHANGED)
  addHistoryEntry(entry: WorkflowHistoryEntry): void {
    if (!this.workflowHistory) {
      this.workflowHistory = [];
    }
    this.workflowHistory.push({
      ...entry,
      timestamp: new Date()
    });
  }

  getNextStep(): WorkflowStep | null {
    const stepOrder = [
      WorkflowStep.LOAN_OFFICER,
      WorkflowStep.BOARD_DIRECTOR,
      WorkflowStep.SENIOR_MANAGER,
      WorkflowStep.MANAGING_DIRECTOR
    ];

    const currentIndex = stepOrder.indexOf(this.currentStep);
    if (currentIndex < stepOrder.length - 1) {
      return stepOrder[currentIndex + 1];
    }
    return null; // At final step
  }

  isAtFinalStep(): boolean {
    return this.currentStep === WorkflowStep.MANAGING_DIRECTOR;
  }

  canBeForwarded(): boolean {
    return this.status === WorkflowStatus.IN_PROGRESS && !this.isAtFinalStep();
  }

  getTotalDuration(): number | null {
    if (!this.completedAt) {
      return null;
    }
    return Math.floor(
      (this.completedAt.getTime() - this.startedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  getCurrentStepDuration(): number {
    const now = new Date();
    const lastEntry = this.workflowHistory[this.workflowHistory.length - 1];
    const startTime = lastEntry ? new Date(lastEntry.timestamp) : this.startedAt;
    return Math.floor(
      (now.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  getStepLabel(step: WorkflowStep): string {
    const labels: Record<WorkflowStep, string> = {
      [WorkflowStep.LOAN_OFFICER]: "Loan Officer Review",
      [WorkflowStep.BOARD_DIRECTOR]: "Board Director Review",
      [WorkflowStep.SENIOR_MANAGER]: "Senior Manager Review",
      [WorkflowStep.MANAGING_DIRECTOR]: "Managing Director Approval"
    };
    return labels[step];
  }
}