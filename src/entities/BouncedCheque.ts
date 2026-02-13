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
import { Organization } from "./Organization";
import { Loan } from "./Loan";
import { BorrowerProfile } from "./BorrowerProfile";

export enum BouncedChequeType {
  INDIVIDUAL = "individual",
  INSTITUTION = "institution",
}

export enum ChequeReturnReason {
  INSUFFICIENT_FUNDS = "insufficient_funds",
  ACCOUNT_CLOSED = "account_closed",
  SIGNATURE_MISMATCH = "signature_mismatch",
  POST_DATED = "post_dated",
  PAYMENT_STOPPED = "payment_stopped",
  REFER_TO_DRAWER = "refer_to_drawer",
  TECHNICAL_REASON = "technical_reason",
  OTHER = "other",
}

export interface BouncedChequeData {
  accountNumber: string;
  type: BouncedChequeType;
  surname?: string;
  institutionName?: string;
  forename1?: string;
  tradingName?: string;
  forename2?: string;
  forename3?: string;
  nationalId?: string;
  companyRegNo?: string;
  passportNo?: string;
  nationality?: string;
  dateOfBirth?: Date;
  companyRegistrationDate?: Date;
  placeOfBirth?: string;
  postalAddressLine1?: string;
  postalAddressLine2?: string;
  town?: string;
  postalCode?: string;
  country?: string;
  chequeNumber: string;
  chequeDate: Date;
  reportedDate: Date;
  currency: string;
  amount: number;
  returnedChequeReason: ChequeReturnReason;
  beneficiaryName: string;
  notes?: string;
}

@Entity("bounced_cheques")
@Index(["organizationId", "accountNumber"])
@Index(["chequeNumber"])
@Index(["reportedDate"])
export class BouncedCheque {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50 })
  accountNumber: string;

  @Column({
    type: "enum",
    enum: BouncedChequeType,
  })
  type: BouncedChequeType;

  // Individual fields
  @Column({ type: "varchar", length: 100, nullable: true })
  surname: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  forename1: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  forename2: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  forename3: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  nationalId: string | null;

  @Column({ type: "date", nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  placeOfBirth: string | null;

  // Institution fields
  @Column({ type: "varchar", length: 255, nullable: true })
  institutionName: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  tradingName: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  companyRegNo: string | null;

  @Column({ type: "date", nullable: true })
  companyRegistrationDate: Date | null;

  // Common fields
  @Column({ type: "varchar", length: 50, nullable: true })
  passportNo: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  nationality: string | null;

  // Postal Address
  @Column({ type: "varchar", length: 255, nullable: true })
  postalAddressLine1: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  postalAddressLine2: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  town: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  country: string | null;

  // Cheque Details
  @Column({ type: "varchar", length: 50 })
  chequeNumber: string;

  @Column({ type: "date" })
  chequeDate: Date;

  @Column({ type: "date" })
  reportedDate: Date;

  @Column({ type: "varchar", length: 10, default: "RWF" })
  currency: string;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  amount: number;

  @Column({
    type: "enum",
    enum: ChequeReturnReason,
  })
  returnedChequeReason: ChequeReturnReason;

  @Column({ type: "varchar", length: 255 })
  beneficiaryName: string;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  // Relations
  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  loanId: number | null;

  @Column({ type: "int", nullable: true })
  borrowerId: number | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, (organization) => organization.bouncedCheques)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @ManyToOne(() => Loan, (loan) => loan.bouncedCheques, { nullable: true })
  @JoinColumn({ name: "loanId" })
  loan: Loan | null;

  @ManyToOne(() => BorrowerProfile, (borrower) => borrower.bouncedCheques, {
    nullable: true,
  })
  @JoinColumn({ name: "borrowerId" })
  borrower: BorrowerProfile | null;

  // Business methods
  getFullName(): string {
    if (this.type === BouncedChequeType.INDIVIDUAL) {
      const names = [this.surname, this.forename1, this.forename2, this.forename3]
        .filter(Boolean);
      return names.join(" ");
    }
    return this.institutionName || this.tradingName || "Unknown";
  }

  getFullAddress(): string {
    const parts = [
      this.postalAddressLine1,
      this.postalAddressLine2,
      this.town,
      this.postalCode,
      this.country,
    ].filter(Boolean);
    return parts.join(", ");
  }

  isOverdue(daysSinceReport: number = 30): boolean {
    const today = new Date();
    const reportDate = new Date(this.reportedDate);
    const diffTime = Math.abs(today.getTime() - reportDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > daysSinceReport;
  }
}