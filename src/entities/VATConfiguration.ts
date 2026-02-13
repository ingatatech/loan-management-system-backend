import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Organization } from "./Organization";

export enum VATType {
  INPUT = "input",   // VAT on Expenses (we are debited)
  OUTPUT = "output"  // VAT on Revenue/Sales (we are credited)
}

@Entity("vat_configurations")
@Index(["organizationId", "vatType", "isActive"])
@Index(["effectiveFrom"])
export class VATConfiguration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  organizationId: number;

  @Column({
    type: "enum",
    enum: VATType
  })
  vatType: VATType;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  rate: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "date" })
  effectiveFrom: Date;

  @Column({ type: "date", nullable: true })
  effectiveTo: Date | null;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Organization, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  // Enhanced Business Methods
  isCurrentlyActive(): boolean {
    if (!this.isActive) return false;

    const today = new Date();
    const effectiveFrom = this.effectiveFrom instanceof Date 
      ? this.effectiveFrom 
      : new Date(this.effectiveFrom);

    if (today < effectiveFrom) return false;

    if (this.effectiveTo) {
      const effectiveTo = this.effectiveTo instanceof Date 
        ? this.effectiveTo 
        : new Date(this.effectiveTo);
      
      if (today > effectiveTo) return false;
    }

    return true;
  }

  /**
   * Calculate VAT on Sales/Revenue (Output VAT)
   * Formula: VAT = Base Amount × (18/100)
   * On our side: We are CREDITED for this VAT
   */
  calculateOutputVAT(baseAmount: number): number {
    const amountNum = Number(baseAmount) || 0;
    const rateNum = Number(this.rate) || 0;
    
    const vatAmount = (amountNum * rateNum) / 100;
    return Number(vatAmount.toFixed(2));
  }

  /**
   * Calculate VAT on Expenses (Input VAT)
   * Formula: VAT = Purchase Price × (18/118)
   * On our side: We are DEBITED for this VAT
   */
  calculateInputVAT(purchasePrice: number): number {
    const priceNum = Number(purchasePrice) || 0;
    const rateNum = Number(this.rate) || 0;
    
    // Extract VAT from gross amount
    const vatAmount = (priceNum * rateNum) / (100 + rateNum);
    return Number(vatAmount.toFixed(2));
  }

  /**
   * Calculate base amount from VAT-inclusive price (Reverse calculation)
   */
  calculateBaseFromGross(grossAmount: number): number {
    const grossNum = Number(grossAmount) || 0;
    const rateNum = Number(this.rate) || 0;
    
    const baseAmount = grossNum / (1 + rateNum / 100);
    return Number(baseAmount.toFixed(2));
  }

  /**
   * Calculate gross amount from base (base + VAT)
   */
  calculateGrossFromBase(baseAmount: number): number {
    const baseNum = Number(baseAmount) || 0;
    const vatAmount = this.calculateOutputVAT(baseNum);
    
    return Number((baseNum + vatAmount).toFixed(2));
  }

  /**
   * General VAT calculation (for backward compatibility)
   */
  calculateVAT(amount: number): number {
    // Default to output VAT calculation
    return this.calculateOutputVAT(amount);
  }

  isExpired(): boolean {
    if (!this.effectiveTo) return false;

    const today = new Date();
    const effectiveTo = this.effectiveTo instanceof Date 
      ? this.effectiveTo 
      : new Date(this.effectiveTo);

    return today > effectiveTo;
  }

  getDaysUntilExpiry(): number | null {
    if (!this.effectiveTo) return null;

    const today = new Date();
    const effectiveTo = this.effectiveTo instanceof Date 
      ? this.effectiveTo 
      : new Date(this.effectiveTo);

    const diffTime = effectiveTo.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}