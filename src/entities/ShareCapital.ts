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
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";
import { Organization } from "./Organization";
import { IndividualShareholder } from "./IndividualShareholder";
import { InstitutionShareholder } from "./InstitutionShareholder";

export enum ShareholderType {
  INDIVIDUAL = "individual",
  INSTITUTION = "institution",
}

export enum ShareType {
  ORDINARY = "ordinary",
  PREFERENCE = "preference",
  CUMULATIVE_PREFERENCE = "cumulative_preference",
  REDEEMABLE = "redeemable",
  OTHER = "other"
}

interface PaymentDetails {
  paymentMethod: string;
  paymentDate: Date;
  paymentReference: string;
  bankName?: string;
  accountNumber?: string;
  chequeNumber?: string;
  transactionId?: string;
  paymentProofUrl?: string;
  paymentProofUrls?: string[];
}

@Entity("share_capitals")
@Index(["shareholderId", "shareholderType", "organization"], { unique: true })
export class ShareCapital {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "shareholder_id" })
  shareholderId: number;

  @Column({
    type: "enum",
    enum: ShareholderType,
    name: "shareholder_type",
  })
  shareholderType: ShareholderType;

  @Column({ type: "date" })
  dateOfContribution: Date;

  @Column({
    type: "enum",
    enum: ShareType,
    default: ShareType.ORDINARY,
  })
  typeOfShare: ShareType;

  // 🔧 FIX: Explicitly define as integer type
  @Column({ type: "integer" })
  numberOfShares: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  valuePerShare: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalContributedCapitalValue: number;

  @Column("jsonb")
  paymentDetails: PaymentDetails;

  @Column({ type: "text", nullable: true })
  contributionCertificateUrl: string | null;

  @Column({ type: "text", nullable: true })
  paymentProofUrl: string | null;

  @Column("text", { array: true, nullable: true })
  additionalDocuments: string[] | null;

  @Column({ type: "boolean", default: false })
  isVerified: boolean;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  // 🔧 FIX: Explicitly define as integer type
  @Column({ type: "integer", default: 1 })
  contributionCount: number;

  @Column({ type: "date", nullable: true })
  lastContributionDate: Date | null;

  @Column({ type: "date" })
  firstContributionDate: Date;

  @ManyToOne(() => Organization, (organization) => organization.shareCapitals, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @Column({ name: "organization_id" })
  organizationId: number;

  @ManyToOne(() => IndividualShareholder, (shareholder) => shareholder.shareCapitals, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "individual_shareholder_id" })
  individualShareholder: IndividualShareholder | null;

  @ManyToOne(() => InstitutionShareholder, (shareholder) => shareholder.shareCapitals, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "institution_shareholder_id" })
  institutionShareholder: InstitutionShareholder | null;

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
  calculateTotalValue() {
    // 🔧 FIX: Ensure numeric types before calculation
    this.numberOfShares = Number(this.numberOfShares);
    this.valuePerShare = Number(this.valuePerShare);
    this.totalContributedCapitalValue = this.numberOfShares * this.valuePerShare;
  }

  // 🔧 FIXED METHOD: Add contribution to existing record
  addContribution(newShares: number, newValuePerShare: number, paymentDetails?: Partial<PaymentDetails>): void {
    console.log("🔢 [DEBUG] Starting addContribution");
    console.log("📊 [DEBUG] Current shares:", this.numberOfShares, typeof this.numberOfShares);
    console.log("➕ [DEBUG] New shares:", newShares, typeof newShares);
    
    // 🔧 FIX: Force conversion to numbers to prevent string concatenation
    const currentSharesNum = Number(this.numberOfShares) || 0;
    const newSharesNum = Number(newShares) || 0;
    const currentValueNum = Number(this.valuePerShare) || 0;
    const newValueNum = Number(newValuePerShare) || 0;
    
    console.log("🔄 [DEBUG] Converted current shares:", currentSharesNum);
    console.log("🔄 [DEBUG] Converted new shares:", newSharesNum);
    
    // Calculate weighted average for value per share
    const currentTotal = currentSharesNum * currentValueNum;
    const newTotal = newSharesNum * newValueNum;
    const totalShares = currentSharesNum + newSharesNum;
    
    console.log("📊 [DEBUG] Current total value:", currentTotal);
    console.log("📊 [DEBUG] New total value:", newTotal);
    console.log("📊 [DEBUG] Total shares after addition:", totalShares);
    
    // 🔧 FIX: Explicitly assign as numbers
    this.numberOfShares = totalShares;
    this.valuePerShare = totalShares > 0 ? (currentTotal + newTotal) / totalShares : newValueNum;
    this.contributionCount = Number(this.contributionCount || 0) + 1;
    this.lastContributionDate = new Date();
    
    console.log("✅ [DEBUG] Final numberOfShares:", this.numberOfShares, typeof this.numberOfShares);
    
    // Update payment details if provided
    if (paymentDetails) {
      if (paymentDetails.paymentProofUrl && !this.paymentDetails.paymentProofUrls?.includes(paymentDetails.paymentProofUrl)) {
        if (!this.paymentDetails.paymentProofUrls) {
          this.paymentDetails.paymentProofUrls = [];
        }
        this.paymentDetails.paymentProofUrls.push(paymentDetails.paymentProofUrl);
      }
      
      this.paymentDetails = {
        ...this.paymentDetails,
        ...paymentDetails,
        paymentProofUrls: this.paymentDetails.paymentProofUrls
      };
    }
    
    // Recalculate total value
    this.calculateTotalValue();
    
    console.log("✅ [DEBUG] Final calculated total value:", this.totalContributedCapitalValue);
  }

  // Business methods remain the same...
  getShareholderName(): string {
    if (this.shareholderType === ShareholderType.INDIVIDUAL && this.individualShareholder) {
      return this.individualShareholder.getFullName();
    }
    if (this.shareholderType === ShareholderType.INSTITUTION && this.institutionShareholder) {
      return this.institutionShareholder.institutionName;
    }
    return "Unknown Shareholder";
  }

  getOwnershipPercentage(totalOrganizationCapital: number): number {
    if (totalOrganizationCapital === 0) return 0;
    return (this.totalContributedCapitalValue / totalOrganizationCapital) * 100;
  }

  isDividendEligible(): boolean {
    return this.isVerified && this.isActive && this.typeOfShare !== ShareType.REDEEMABLE;
  }

  hasPaymentProof(): boolean {
    return !!(this.paymentProofUrl || this.paymentDetails.paymentProofUrl || 
              this.paymentDetails.paymentProofUrls?.length > 0);
  }

  getFormattedShareType(): string {
    return this.typeOfShare.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getContributionAge(): number {
    const today = new Date();
    const contributionDate = new Date(this.dateOfContribution);
    return Math.floor((today.getTime() - contributionDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  isRecentContribution(days: number = 30): boolean {
    return this.getContributionAge() <= days;
  }

  canBeModified(): boolean {
    return !this.isVerified && this.getContributionAge() <= 30;
  }

  getVotingPower(): number {
    if (this.typeOfShare === ShareType.ORDINARY) {
      return this.numberOfShares;
    }
    return 0;
  }
}