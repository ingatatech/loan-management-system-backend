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
    name: "loan_analysis_note",
    type: "text",
    nullable: true
  })
  loanAnalysisNote: string | null;
  @Column({
    name: "forward_to_ids",
    type: "jsonb",
    nullable: true
  })
  forwardToIds: number[] | null;

    @Column({
    name: "forward_to_roles",
    type: "jsonb",
    nullable: true
  })
  forwardToRoles: string[] | null;

  @Column({
    name: "review_attachment_url",
    type: "varchar",
    length: 500,
    nullable: true
  })
  reviewAttachmentUrl: string | null;

    @Column({
    name: "review_attachment_name",
    type: "varchar",
    length: 255,
    nullable: true
  })
  reviewAttachmentName: string | null;

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
    return this.decision === ReviewDecision.FORWARD && this.forwardToIds !== null;
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