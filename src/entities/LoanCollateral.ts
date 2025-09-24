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

  @Column({ type: "text", nullable: true })
  guarantorAddress: string | null;

  @OneToMany(() => Guarantor, (guarantor) => guarantor.collateral, {
    cascade: ["remove"],
  })
  guarantors: Guarantor[];

  @Column({ type: "text", nullable: true })
  additionalDocumentsUrls?: string;

  @Column({ type: "text", nullable: true })
  proofOfOwnershipUrl: string | null;

  @Column({ type: "text", nullable: true })
  ownerIdentificationUrl: string | null;

  @Column({ type: "text", nullable: true })
  legalDocumentUrl: string | null;

  @Column({ type: "text", nullable: true })
  physicalEvidenceUrl: string | null;

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

  // ========================================
  // ✅ NEW: Extended Collateral Fields
  // ========================================

  /**
   * Account number associated with the collateral
   */
  @Column({ type: "varchar", length: 50, nullable: true })
  accountNumber: string | null;

  /**
   * Extended collateral type (more detailed than enum)
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  extendedCollateralType: string | null;

  /**
   * Extended collateral value (can differ from original)
   */
  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  extendedCollateralValue: number | null;

  /**
   * Date of last valuation
   */
  @Column({ type: "date", nullable: true })
  collateralLastValuationDate: Date | null;

  /**
   * Expiry date of the collateral
   */
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

  // ========================================
  // PHASE 1: Enhanced Collateral Valuation
  // ========================================

  /**
   * Get valuation percentage (haircut) based on collateral type
   * Returns the percentage of collateral value to use for provisioning calculations
   */
  getValuationPercentage(): number {
    const rates = {
      'movable': 0.60,      // Vehicles, equipment - 60%
      'immovable': 0.80,    // Real estate - 80%
      'financial': 1.00,    // Cash, bonds - 100%
      'guarantee': 0.20     // Personal guarantees - 20%
    };
    return rates[this.collateralType] || 0.50; // Default 50% if type not found
  }

  /**
   * Computed property: Effective collateral value after applying haircut
   * This is the value used in net exposure calculations
   */
  get effectiveValue(): number {
    const valuationPercentage = this.getValuationPercentage();
    // Use extended value if available, otherwise use original value
    const baseValue = this.extendedCollateralValue || this.collateralValue;
    const effectiveVal = baseValue * valuationPercentage;
    return Math.round(effectiveVal * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get detailed valuation breakdown
   */
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
      valuationPercentage: valuationPercentage * 100, // Convert to percentage
      haircutPercentage: Math.round(haircutPercentage * 100) / 100,
      haircutAmount: Math.round(haircutAmount * 100) / 100,
      effectiveValue: this.effectiveValue,
      collateralType: this.collateralType
    };
  }

  // ========================================
  // EXISTING: Business methods (maintained 100%)
  // ========================================

  isValidCollateral(): boolean {
    return this.isActive && this.collateralValue > 0;
  }

  getCoverageRatio(loanAmount: number): number {
    // Use effective value for coverage calculation
    return loanAmount > 0 ? (this.effectiveValue / loanAmount) * 100 : 0;
  }

  /**
   * Check if collateral needs revaluation
   * @param monthsThreshold Number of months after which revaluation is needed
   */
  needsRevaluation(monthsThreshold: number = 12): boolean {
    // Check both valuationDate and collateralLastValuationDate
    const lastValuation = this.collateralLastValuationDate || this.valuationDate;
    
    if (!lastValuation) return true;

    const valuationDate = lastValuation instanceof Date
      ? lastValuation
      : new Date(lastValuation);

    const monthsSinceValuation =
      (new Date().getTime() - valuationDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    return monthsSinceValuation > monthsThreshold;
  }

  /**
   * Get collateral age in months
   */
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

  /**
   * Check if collateral is expired
   */
  isExpired(): boolean {
    if (!this.collateralExpiryDate) return false;

    const expiryDate = this.collateralExpiryDate instanceof Date
      ? this.collateralExpiryDate
      : new Date(this.collateralExpiryDate);

    return expiryDate < new Date();
  }

  /**
   * Get days until expiry (negative if expired)
   */
  getDaysUntilExpiry(): number | null {
    if (!this.collateralExpiryDate) return null;

    const expiryDate = this.collateralExpiryDate instanceof Date
      ? this.collateralExpiryDate
      : new Date(this.collateralExpiryDate);

    const diffTime = expiryDate.getTime() - new Date().getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
}