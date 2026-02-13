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
  INPUT = "input", 
  OUTPUT = "output"
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

  // Enhanced Business Methods - CORRECTED FORMULAS

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
   * Calculate Output VAT for Revenue/Sales - CORRECTED
   * User enters TOTAL amount received (including VAT)
   * VAT = Total Amount × (rate/(100 + rate))
   */
  calculateOutputVATFromTotal(totalAmount: number): {
    vatAmount: number;
    baseAmount: number;
    totalAmount: number;
  } {
    const totalNum = Number(totalAmount) || 0;
    const rateNum = Number(this.rate) || 0;
    
    // VAT = Total × (rate/(100 + rate))
    const vatAmount = (totalNum * rateNum) / (100 + rateNum);
    const baseAmount = totalNum - vatAmount;
    
    return {
      totalAmount: Number(totalNum.toFixed(2)),
      baseAmount: Number(baseAmount.toFixed(2)),
      vatAmount: Number(vatAmount.toFixed(2))
    };
  }

  /**
   * Calculate Input VAT for Expenses - CORRECTED
   * User enters TOTAL amount paid (including VAT)
   * Base Amount = Total Amount ÷ (1 + rate/100)
   * VAT = Total Amount - Base Amount
   */
  calculateInputVATFromTotal(totalAmount: number): {
    vatAmount: number;
    baseAmount: number;
    totalAmount: number;
  } {
    const totalNum = Number(totalAmount) || 0;
    const rateNum = Number(this.rate) || 0;
    
    // Base = Total ÷ (1 + rate/100)
    const baseAmount = totalNum / (1 + (rateNum / 100));
    // VAT = Total - Base
    const vatAmount = totalNum - baseAmount;
    
    return {
      totalAmount: Number(totalNum.toFixed(2)),
      baseAmount: Number(baseAmount.toFixed(2)),
      vatAmount: Number(vatAmount.toFixed(2))
    };
  }

  /**
   * Legacy: Calculate Output VAT from base amount (for backward compatibility)
   * VAT = Base × (rate/100)
   */
  calculateOutputVATFromBase(baseAmount: number): number {
    const baseNum = Number(baseAmount) || 0;
    const rateNum = Number(this.rate) || 0;
    
    const vatAmount = (baseNum * rateNum) / 100;
    return Number(vatAmount.toFixed(2));
  }

  /**
   * Calculate gross amount from base (base + VAT)
   */
  calculateGrossFromBase(baseAmount: number): number {
    const baseNum = Number(baseAmount) || 0;
    const vatAmount = this.calculateOutputVATFromBase(baseNum);
    
    return Number((baseNum + vatAmount).toFixed(2));
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