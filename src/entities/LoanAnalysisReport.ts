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

export enum ReportType {
  APPROVE = "approve",
  REJECT = "reject"
}

export enum ReportStatus {
  DRAFT = "draft",
  PENDING_LOAN_OFFICER = "pending_loan_officer",
  PENDING_MANAGING_DIRECTOR = "pending_managing_director",
  FINALIZED = "finalized"
}

export interface LoanApplicationRequirements {
  requestedAmount: number;
  loanPeriod: number;
  loanPeriodUnit: string; 
  paymentModality: string; 
  fundingPurpose: string;
  submissionDate: Date;
}

export interface ApprovalConditions {
  approvedAmount: number;
  repaymentPeriod: number;
  repaymentPeriodUnit: string;
  paymentModality: string;
  interestRate: number;
  interestMethod?: string;
  gracePeriodMonths?: number;
  specialConditions?: string[];
  additionalTerms?: string;
    repaymentModality?: string;  
  singlePaymentMonths?: number;         
  customSchedule?: Array<{          
    installmentNumber: number;
    dueDate: string;
    amount: number;
    notes?: string;
  }>;
}

export interface RejectionReasons {
  primaryReason: string;
  detailedReasons: string[];
  recommendations?: string;
  additionalNotes?: string;
}

@Entity("loan_analysis_reports")
@Index(["loanId", "organizationId"])
@Index(["reportType"])
@Index(["status"])
@Index(["createdAt"])
export class LoanAnalysisReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  reportId: string;

  @Column({ type: "int" })
  loanId: number;

  @Column({
    type: "enum",
    enum: ReportType
  })
  reportType: ReportType;

  @Column({
    type: "enum",
    enum: ReportStatus,
    default: ReportStatus.DRAFT
  })
  status: ReportStatus;

  @Column({ type: "varchar", length: 200 })
  applicantName: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  applicantType: string | null; 

  @Column({ type: "text" })
  introductionMessage: string;

  @Column({ type: "jsonb" })
  applicationRequirements: LoanApplicationRequirements;


  @Column({ type: "text", nullable: true })
  approveMessage: string | null;

  @Column({ type: "jsonb", nullable: true })
  approvalConditions: ApprovalConditions | null;

  @Column({ type: "text", nullable: true })
  rejectMessage: string | null;

  @Column({ type: "jsonb", nullable: true })
  rejectionReasons: RejectionReasons | null;


  @Column({ type: "int", nullable: true })
  loanOfficerId: number | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  loanOfficerName: string | null;

  @Column({ type: "text", nullable: true })
  loanOfficerSignatureUrl: string | null;

  @Column({ type: "timestamp", nullable: true })
  loanOfficerSignedAt: Date | null;

  @Column({ type: "boolean", default: false })
  isLoanOfficerSigned: boolean;

  @Column({ type: "int", nullable: true })
  managingDirectorId: number | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  managingDirectorName: string | null;

  @Column({ type: "text", nullable: true })
  managingDirectorSignatureUrl: string | null;

  @Column({ type: "timestamp", nullable: true })
  managingDirectorSignedAt: Date | null;

  @Column({ type: "boolean", default: false })
  isManagingDirectorSigned: boolean;

  @Column({ type: "boolean", default: false })
  isFinalized: boolean;

  @Column({ type: "timestamp", nullable: true })
  finalizedAt: Date | null;

  @Column({ type: "int", nullable: true })
  finalizedBy: number | null;

  @Column({ type: "text", nullable: true })
  additionalNotes: string | null;

  @Column({ type: "text", nullable: true })
  internalRemarks: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Loan, (loan) => loan.analysisReports)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "loanOfficerId" })
  loanOfficer: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "managingDirectorId" })
  managingDirector: User | null;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "createdBy" })
  creator: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "updatedBy" })
  updater: User | null;

  
  isFullySigned(): boolean {
    return this.isLoanOfficerSigned && this.isManagingDirectorSigned;
  }

  canFinalize(): boolean {
    return this.isFullySigned() && !this.isFinalized;
  }

  canModify(): boolean {
    return !this.isFinalized;
  }

  getSignatureStatus(): {
    loanOfficer: boolean;
    managingDirector: boolean;
    complete: boolean;
  } {
    return {
      loanOfficer: this.isLoanOfficerSigned,
      managingDirector: this.isManagingDirectorSigned,
      complete: this.isFullySigned()
    };
  }

  getFormattedIntroduction(): string {
    const { submissionDate, requestedAmount, loanPeriod, loanPeriodUnit, paymentModality, fundingPurpose } = 
      this.applicationRequirements;
    
    const date = new Date(submissionDate);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    return this.introductionMessage
      .replace(/\[day\/month\/year\]/g, `${day}/${month}/${year}`)
      .replace(/\[requested_amount\]/g, requestedAmount.toLocaleString())
      .replace(/\[loan_period\]/g, `${loanPeriod} ${loanPeriodUnit}`)
      .replace(/\[payment_modality\]/g, paymentModality)
      .replace(/\[funding_purpose\]/g, fundingPurpose);
  }

  getFormattedApprovalMessage(): string | null {
    if (!this.approveMessage || !this.approvalConditions) return null;

    const { approvedAmount, repaymentPeriod, repaymentPeriodUnit, paymentModality, interestRate } = 
      this.approvalConditions;
    
    return this.approveMessage
      .replace(/\[approved_amount\]/g, approvedAmount.toLocaleString())
      .replace(/\[repayment_period\]/g, `${repaymentPeriod} ${repaymentPeriodUnit}`)
      .replace(/\[payment_modality\]/g, paymentModality)
      .replace(/\[interest_rate\]/g, `${interestRate}%`);
  }

  getFormattedRejectionMessage(): string | null {
    if (!this.rejectMessage || !this.rejectionReasons) return null;

    let message = this.rejectMessage + "\n\n";
    message += `Primary Reason: ${this.rejectionReasons.primaryReason}\n\n`;
    message += "Detailed Reasons:\n";
    this.rejectionReasons.detailedReasons.forEach((reason, index) => {
      message += `${index + 1}. ${reason}\n`;
    });

    if (this.rejectionReasons.recommendations) {
      message += `\nRecommendations: ${this.rejectionReasons.recommendations}`;
    }

    return message;
  }

  updateStatus(): void {
    if (this.isFinalized) {
      this.status = ReportStatus.FINALIZED;
    } else if (this.isLoanOfficerSigned && !this.isManagingDirectorSigned) {
      this.status = ReportStatus.PENDING_MANAGING_DIRECTOR;
    } else if (!this.isLoanOfficerSigned) {
      this.status = ReportStatus.PENDING_LOAN_OFFICER;
    } else {
      this.status = ReportStatus.DRAFT;
    }
  }

  getCompletionPercentage(): number {
    let completed = 0;
    let total = 2;

    if (this.isLoanOfficerSigned) completed++;
    if (this.isManagingDirectorSigned) completed++;

    return (completed / total) * 100;
  }

    getRepaymentStructure(): {
    modality: string;
    description: string;
    details?: string;
  } | null {
    if (!this.approvalConditions) return null;

    const modality = this.approvalConditions.repaymentModality || 'multiple_with_interest';
    
    const descriptions: Record<string, string> = {
      single: 'One lump sum payment',
      multiple_with_interest: 'Standard amortization',
      multiple_only_interest: 'Interest-only with balloon payment',
      customized: 'Custom payment schedule'
    };

    let details: string | undefined;

    if (modality === 'single' && this.approvalConditions.singlePaymentMonths) {
      details = `Payment due after ${this.approvalConditions.singlePaymentMonths} months`;
    } else if (modality === 'customized' && this.approvalConditions.customSchedule) {
      details = `${this.approvalConditions.customSchedule.length} custom installments`;
    }

    return {
      modality,
      description: descriptions[modality] || descriptions.multiple_with_interest,
      details
    };
  }
    validateCustomSchedule(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.approvalConditions?.repaymentModality) {
      return { valid: true, errors: [] };
    }

    if (this.approvalConditions.repaymentModality !== 'customized') {
      return { valid: true, errors: [] };
    }

    if (!this.approvalConditions.customSchedule || this.approvalConditions.customSchedule.length === 0) {
      errors.push("Custom schedule is required for customized repayment modality");
      return { valid: false, errors };
    }

    // Validate dates are in order
    const dates = this.approvalConditions.customSchedule.map(item => new Date(item.dueDate));
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] <= dates[i - 1]) {
        errors.push("Payment dates must be in chronological order");
        break;
      }
    }

    // Validate amounts are positive
    const hasNegativeAmount = this.approvalConditions.customSchedule.some(item => item.amount <= 0);
    if (hasNegativeAmount) {
      errors.push("All payment amounts must be positive");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}