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
import { LoanCollateral } from "./LoanCollateral";
import { BorrowerProfile } from "./BorrowerProfile";
import { Organization } from "./Organization";

@Entity("guarantors")
@Index(["loanId", "collateralId"])
@Index(["borrowerId"])
@Index(["organizationId"])
export class Guarantor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "int" })
  collateralId: number;

  @Column({ type: "int" })
  borrowerId: number;

  @Column({ type: "int" })
  organizationId: number;

  // ============ ORIGINAL FIELDS ============
  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 20 })
  phone: string;

  @Column({ type: "text" })
  address: string;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  guaranteedAmount: number;

  @Column({ type: "varchar", length: 50 })
  collateralType: string;

  @Column({ type: "text", nullable: true })
  collateralDescription: string | null;

  // ✅ ENHANCED: Guarantor Documents Array
  @Column({ type: "jsonb", nullable: true })
  guarantorDocuments: Array<{
    documentDescription: string;
    documentUrl: string;
    uploadedAt: Date;
  }> | null;

  @Column({ type: "text", nullable: true })
  identificationDocumentUrls: string | null;

  getIdentificationDocuments(): any[] {
    if (!this.identificationDocumentUrls) return [];
    
    try {
      const parsed = JSON.parse(this.identificationDocumentUrls);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

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

  // ============ EXTENDED GUARANTOR FIELDS ============
  @Column({ type: 'varchar', length: 50, nullable: true })
  accountNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  guarantorType: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  surname: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  institutionName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  forename1: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tradingName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  forename2: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  forename3: string | null;

  // Identification
  @Column({ type: 'varchar', length: 50, nullable: true })
  nationalId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  companyRegNo: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  passportNo: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nationality: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: 'date', nullable: true })
  companyRegistrationDate: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  placeOfBirth: string | null;

  // Postal Address
  @Column({ type: 'varchar', length: 200, nullable: true })
  postalAddressLine1: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  postalAddressLine2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  town: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  // Contact Information
  @Column({ type: 'varchar', length: 20, nullable: true })
  workTelephone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  homeTelephone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobileTelephone: string | null;

  // ============ RELATIONSHIPS ============
  @ManyToOne(() => Loan, (loan) => loan.guarantors)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @ManyToOne(() => LoanCollateral, (collateral) => collateral.guarantors)
  @JoinColumn({ name: "collateralId" })
  collateral: LoanCollateral;

  @ManyToOne(() => BorrowerProfile, (borrower) => borrower.guarantors)
  @JoinColumn({ name: "borrowerId" })
  borrower: BorrowerProfile;

  @ManyToOne(() => Organization, (organization) => organization.guarantors)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  addIdentificationDocument(url: string): void {
    const currentDocs = this.getIdentificationDocuments();
    
    if (currentDocs.length >= 5) {
      throw new Error('Maximum of 5 identification documents allowed');
    }

    currentDocs.push({
      url,
      uploadedAt: new Date().toISOString(),
      type: 'identification'
    });

    this.identificationDocumentUrls = JSON.stringify(currentDocs);
  }

  // ============ ORIGINAL BUSINESS METHODS ============
  getGuaranteeCoverage(loanAmount: number): number {
    return loanAmount > 0 ? (this.guaranteedAmount / loanAmount) * 100 : 0;
  }

  isValidGuarantor(): boolean {
    return this.isActive && 
           this.name?.trim().length > 0 && 
           this.phone?.trim().length > 0 && 
           this.guaranteedAmount > 0;
  }
addGuarantorDocument(description: string, documentUrl: string): void {
  if (!this.guarantorDocuments) {
    this.guarantorDocuments = [];
  }

  this.guarantorDocuments.push({
    documentDescription: description,
    documentUrl: documentUrl,
    uploadedAt: new Date()
  });
  
  console.log(`📄 Document added to guarantor ${this.id}: ${description}`);
}

  // ✅ NEW: Get guarantor documents
  getGuarantorDocuments(): Array<{
    documentDescription: string;
    documentUrl: string;
    uploadedAt: Date;
  }> {
    return this.guarantorDocuments || [];
  }

  // Helper methods
  getFullName(): string {
    if (this.guarantorType === 'institution') {
      return this.institutionName || this.name;
    }
    
    const parts = [this.surname, this.forename1, this.forename2, this.forename3].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : this.name;
  }

  isExtended(): boolean {
    return !!(this.accountNumber || this.guarantorType);
  }
}

// Interface for extended data
export interface ExtendedGuarantorData {
  accountNumber?: string;
  guarantorType?: 'individual' | 'institution';
  surname?: string;
  forename1?: string;
  forename2?: string;
  forename3?: string;
  nationalId?: string;
  dateOfBirth?: Date;
  placeOfBirth?: string;
  institutionName?: string;
  tradingName?: string;
  companyRegNo?: string;
  companyRegistrationDate?: Date;
  passportNo?: string;
  nationality?: string;
  postalAddressLine1?: string;
  postalAddressLine2?: string;
  town?: string;
  postalCode?: string;
  country?: string;
  workTelephone?: string;
  homeTelephone?: string;
  mobileTelephone?: string;
  identificationDocuments?: string[];
}