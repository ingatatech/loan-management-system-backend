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
import { WorkflowStep } from "./LoanWorkflow";

export enum ReviewStatus {
  PENDING = "pending",
  REVIEWED = "reviewed",
}

export enum ReviewDecision {
  APPROVE = "approve",
  REJECT = "reject",
  FORWARD = "forward",
  REQUEST_INFO = "request_info"
}

@Entity("loan_reviews")
@Index(["loanId", "createdAt"])
@Index(["reviewedBy", "createdAt"])
@Index(["workflowStep"])
@Index(["decision"])
export class LoanReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "int" })
  reviewedBy: number;

  @Column({ type: "text" })
  reviewMessage: string;

  @Column({
    type: "enum",
    enum: ReviewStatus,
    default: ReviewStatus.REVIEWED,
  })
  status: ReviewStatus;

  // ✅ NEW FIELDS
  @Column({
    name: "reviewer_role",
    type: "enum",
    enum: WorkflowStep,
    nullable: true
  })
  reviewerRole: WorkflowStep | null;

  @Column({
    name: "workflow_step",
    type: "int",
    nullable: true
  })
  workflowStep: number | null;

  @Column({
    type: "enum",
    enum: ReviewDecision,
    nullable: true
  })
  decision: ReviewDecision | null;

  @Column({
    name: "forwarded_to_id",
    type: "int",
    nullable: true
  })
  forwardedToId: number | null;

  @Column({
    name: "reviewed_at",
    type: "timestamp",
    nullable: true
  })
  reviewedAt: Date | null;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Loan, (loan) => loan.reviews, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @ManyToOne(() => User)
  @JoinColumn({ name: "reviewedBy" })
  reviewer: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "forwarded_to_id" })
  forwardedTo: User | null;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  // ✅ NEW BUSINESS METHODS
  isForwarded(): boolean {
    return this.decision === ReviewDecision.FORWARD && this.forwardedToId !== null;
  }

  isApproval(): boolean {
    return this.decision === ReviewDecision.APPROVE;
  }

  isRejection(): boolean {
    return this.decision === ReviewDecision.REJECT;
  }

  isInfoRequest(): boolean {
    return this.decision === ReviewDecision.REQUEST_INFO;
  }

  getDecisionLabel(): string {
    const labels: Record<ReviewDecision, string> = {
      [ReviewDecision.APPROVE]: "Approved",
      [ReviewDecision.REJECT]: "Rejected",
      [ReviewDecision.FORWARD]: "Forwarded",
      [ReviewDecision.REQUEST_INFO]: "Requested Information"
    };
    return this.decision ? labels[this.decision] : "Pending";
  }
}