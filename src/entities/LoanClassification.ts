import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Loan } from "./Loan";

export enum LoanClass {
  NORMAL = "normal",
  WATCH = "watch",
  SUBSTANDARD = "substandard",
  DOUBTFUL = "doubtful",
  LOSS = "loss"
}

@Entity("loan_classifications")
@Index(["loanId", "classificationDate"])
@Index(["classificationDate"])
@Index(["loanClass"])
export class LoanClassification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "date" })
  classificationDate: Date;

  @Column({ type: "int" })
  daysInArrears: number;

  @Column({
    type: "enum",
    enum: LoanClass
  })
  loanClass: LoanClass;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  outstandingBalance: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  collateralValue: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  netExposure: number;

  @Column({ type: "decimal", precision: 5, scale: 4 })
  provisioningRate: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  provisionRequired: number;

  // ✅ NEW FIELD: Previous provisions from last reporting period
  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  previousProvisionsHeld: number;

  // ✅ NEW FIELD: Additional provisions needed this period
  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  additionalProvisionsThisPeriod: number;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => Loan, (loan) => loan.classifications)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  updatedAt: Date;


  isProvisionAdequate(): boolean {
    return this.provisionRequired <= (this.previousProvisionsHeld + this.additionalProvisionsThisPeriod);
  }


  getProvisionShortfall(): number {
    return Math.max(0, this.provisionRequired - (this.previousProvisionsHeld + this.additionalProvisionsThisPeriod));
  }

  /**
   * Get provision status indicator
   */
  getProvisionStatus(): 'ADEQUATE' | 'SHORTFALL' | 'IMPROVED' {
    if (this.additionalProvisionsThisPeriod < 0) return 'IMPROVED';
    if (this.getProvisionShortfall() > 0) return 'SHORTFALL';
    return 'ADEQUATE';
  }

  /**
   * Get provision change summary
   */
  getProvisionChangeSummary(): {
    previousProvisions: number;
    currentRequired: number;
    additionalNeeded: number;
    changeDirection: 'INCREASE' | 'DECREASE' | 'NO_CHANGE';
    changePercentage: number;
  } {
    const changeDirection = 
      this.additionalProvisionsThisPeriod > 0 ? 'INCREASE' :
      this.additionalProvisionsThisPeriod < 0 ? 'DECREASE' : 'NO_CHANGE';
    
    const changePercentage = this.previousProvisionsHeld > 0
      ? Math.round((this.additionalProvisionsThisPeriod / this.previousProvisionsHeld) * 10000) / 100
      : 0;

    return {
      previousProvisions: Math.round(this.previousProvisionsHeld * 100) / 100,
      currentRequired: Math.round(this.provisionRequired * 100) / 100,
      additionalNeeded: Math.round(this.additionalProvisionsThisPeriod * 100) / 100,
      changeDirection,
      changePercentage
    };
  }
}