// @ts-nocheck
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { Loan } from "./Loan";
import { Guarantor } from "./Guarantor";

// Additional Document Interface
export interface AdditionalDocument {
  description: string;
  fileUrl: string;
  documentType: string;
  uploadedAt: string;
}

export interface CollateralData {
  collateralType: CollateralType;
  description: string;
  collateralValue: number;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  proofOfOwnershipUrl?: string;
  proofOfOwnershipType?: string;
  ownerIdentificationUrl?: string;
  valuationReportUrls?: string;
  legalDocumentUrl?: string;
  physicalEvidenceUrl?: string;
  additionalDocumentsUrls: string | null;
  valuationDate?: Date;
  valuedBy?: string;
  notes?: string;
}

export enum CollateralType {
  MOVABLE = "movable",
  IMMOVABLE = "immovable",
  FINANCIAL = "financial",
  GUARANTEE = "guarantee"
}

@Entity("loan_collaterals")
@Index(["loanId"])
@Index(["collateralId"], { unique: true })
export class LoanCollateral {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  collateralId: string;

  @Column({ type: "int" })
  loanId: number;

  @Column({
    type: "enum",
    enum: CollateralType
  })
  collateralType: CollateralType;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  collateralValue: number;

  @Column({ type: "varchar", length: 100, nullable: true })
  guarantorName: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  guarantorPhone: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  upiNumber: string | null;
  
  @Column({ type: "text", nullable: true })
  guarantorAddress: string | null;

  @OneToMany(() => Guarantor, (guarantor) => guarantor.collateral, {
    cascade: ["remove"],
  })
  guarantors: Guarantor[];

  // ========================================
  // ✅ ENHANCED: Document URLs (support multiple)
  // ========================================
  
  @Column({ type: "text", nullable: true })
  proofOfOwnershipUrls: string | null;

  @Column({ type: "text", nullable: true })
  ownerIdentificationUrls: string | null;

  @Column({ type: "text", nullable: true })
  legalDocumentUrls: string | null;

  @Column({ type: "text", nullable: true })
  physicalEvidenceUrls: string | null;

  @Column({ type: "text", nullable: true })
  valuationReportUrls: string | null;

  // ✅ ENHANCED: Additional Documents (dynamic with description)
  @Column({ type: "jsonb", nullable: true })
  additionalDocumentsUrls: AdditionalDocument[] | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  proofOfOwnershipType: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "date", nullable: true })
  valuationDate: Date | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  valuedBy: string | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  // Extended Collateral Fields
  @Column({ type: "varchar", length: 50, nullable: true })
  accountNumber: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  extendedCollateralType: string | null;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  extendedCollateralValue: number | null;

  @Column({ type: "date", nullable: true })
  collateralLastValuationDate: Date | null;

  @Column({ type: "date", nullable: true })
  collateralExpiryDate: Date | null;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Loan, (loan) => loan.collaterals)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  // Enhanced Collateral Valuation
  getValuationPercentage(): number {
    const rates = {
      'movable': 0.60,
      'immovable': 0.80,
      'financial': 1.00,
      'guarantee': 0.20
    };
    return rates[this.collateralType] || 0.50;
  }

  get effectiveValue(): number {
    const valuationPercentage = this.getValuationPercentage();
    const baseValue = this.extendedCollateralValue || this.collateralValue;
    const effectiveVal = baseValue * valuationPercentage;
    return Math.round(effectiveVal * 100) / 100;
  }

  getValuationBreakdown(): {
    originalValue: number;
    extendedValue: number | null;
    valuationPercentage: number;
    haircutPercentage: number;
    haircutAmount: number;
    effectiveValue: number;
    collateralType: string;
  } {
    const valuationPercentage = this.getValuationPercentage();
    const haircutPercentage = (1 - valuationPercentage) * 100;
    const baseValue = this.extendedCollateralValue || this.collateralValue;
    const haircutAmount = baseValue * (1 - valuationPercentage);

    return {
      originalValue: this.collateralValue,
      extendedValue: this.extendedCollateralValue,
      valuationPercentage: valuationPercentage * 100,
      haircutPercentage: Math.round(haircutPercentage * 100) / 100,
      haircutAmount: Math.round(haircutAmount * 100) / 100,
      effectiveValue: this.effectiveValue,
      collateralType: this.collateralType
    };
  }

  // ✅ ENHANCED: Additional Documents Management
  getAdditionalDocuments(): AdditionalDocument[] {
    return this.additionalDocumentsUrls || [];
  }

  addAdditionalDocument(description: string, fileUrl: string, documentType: string): void {
    const currentDocs = this.getAdditionalDocuments();
    
    currentDocs.push({
      description,
      fileUrl,
      documentType,
      uploadedAt: new Date().toISOString()
    });

    this.additionalDocumentsUrls = currentDocs;
  }

  removeAdditionalDocument(fileUrl: string): void {
    const currentDocs = this.getAdditionalDocuments();
    const filtered = currentDocs.filter(doc => doc.fileUrl !== fileUrl);
    this.additionalDocumentsUrls = filtered.length > 0 ? filtered : null;
  }

  // Document URL Getters
  getDocumentUrls(field: 'proofOfOwnership' | 'ownerIdentification' | 'legalDocument' | 'physicalEvidence' | 'valuationReport' | 'upiDocument'): Array<{ url: string; uploadedAt: string; type: string }> {
    const fieldMap = {
      proofOfOwnership: this.proofOfOwnershipUrls,
      ownerIdentification: this.ownerIdentificationUrls,
      legalDocument: this.legalDocumentUrls,
      physicalEvidence: this.physicalEvidenceUrls,
      valuationReport: this.valuationReportUrls,
      upiDocument: this.proofOfOwnershipUrls, 
    };

    const urls = fieldMap[field];
    if (!urls) return [];
    
    try {
      const parsed = JSON.parse(urls);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: any) => {
        if (typeof item === 'string') {
          return { url: item, uploadedAt: '', type: field };
        }
        return {
          url: item?.url || '',
          uploadedAt: item?.uploadedAt || '',
          type: item?.type || field
        };
      });
    } catch {
      return [];
    }
  }

  addDocumentUrl(field: string, url: string): void {
    const fieldMap: any = {
      proofOfOwnership: 'proofOfOwnershipUrls',
      ownerIdentification: 'ownerIdentificationUrls',
      legalDocument: 'legalDocumentUrls',
      physicalEvidence: 'physicalEvidenceUrls',
      valuationReport: 'valuationReportUrls',
      upiDocument: 'proofOfOwnershipUrls',
    };

    const actualField = fieldMap[field];
    if (!actualField) return;

    const currentUrls = this.getDocumentUrls(field as any);
    if (currentUrls.length >= 5) {
      throw new Error(`Maximum of 5 documents allowed for ${field}`);
    }

    currentUrls.push({
      url,
      uploadedAt: new Date().toISOString(),
      type: field
    });

    (this as any)[actualField] = JSON.stringify(currentUrls);
  }

  // Existing business methods
  isValidCollateral(): boolean {
    return this.isActive && this.collateralValue > 0;
  }

  getCoverageRatio(loanAmount: number): number {
    return loanAmount > 0 ? (this.effectiveValue / loanAmount) * 100 : 0;
  }

  needsRevaluation(monthsThreshold: number = 12): boolean {
    const lastValuation = this.collateralLastValuationDate || this.valuationDate;
    
    if (!lastValuation) return true;

    const valuationDate = lastValuation instanceof Date
      ? lastValuation
      : new Date(lastValuation);

    const monthsSinceValuation =
      (new Date().getTime() - valuationDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    return monthsSinceValuation > monthsThreshold;
  }

  getValuationAge(): number {
    const lastValuation = this.collateralLastValuationDate || this.valuationDate;
    
    if (!lastValuation) return -1;

    const valuationDate = lastValuation instanceof Date
      ? lastValuation
      : new Date(lastValuation);

    const months =
      (new Date().getTime() - valuationDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    return Math.floor(months);
  }

  isExpired(): boolean {
    if (!this.collateralExpiryDate) return false;

    const expiryDate = this.collateralExpiryDate instanceof Date
      ? this.collateralExpiryDate
      : new Date(this.collateralExpiryDate);

    return expiryDate < new Date();
  }

  getDaysUntilExpiry(): number | null {
    if (!this.collateralExpiryDate) return null;

    const expiryDate = this.collateralExpiryDate instanceof Date
      ? this.collateralExpiryDate
      : new Date(this.collateralExpiryDate);

    const diffTime = expiryDate.getTime() - new Date().getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
}