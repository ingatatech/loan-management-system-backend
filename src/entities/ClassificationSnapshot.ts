import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export interface ClassBreakdown {
  normal: number;
  watch: number;
  substandard: number;
  doubtful: number;
  loss: number;
}

export interface PARBreakdown {
  par1to30: number;
  par31to90: number;
  par90plus: number;
  totalPAR: number;
}

@Entity("classification_snapshots")
@Index(["organizationId", "snapshotDate"], { unique: true })
@Index(["snapshotDate"])
export class ClassificationSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "date" })
  snapshotDate: Date;

  @Column({ type: "int" })
  totalLoans: number;

  @Column({ type: "int" })
  totalActiveLoans: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalPortfolioValue: number;

  // Classification breakdown (counts)
  @Column({ type: "jsonb" })
  loanCountByClass: ClassBreakdown;

  // Classification breakdown (amounts)
  @Column({ type: "jsonb" })
  outstandingByClass: ClassBreakdown;

  // Provisioning data
  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalProvisionsRequired: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalProvisionsHeld: number;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  provisionAdequacyRatio: number;

  // PAR data
  @Column({ type: "jsonb" })
  parBreakdown: PARBreakdown;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  totalPARRatio: number;

  // Collateral data
  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalCollateralValue: number;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  collateralCoverageRatio: number;

  // Additional metrics
  @Column({ type: "int", default: 0 })
  loansWithOverduePayments: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  averageDaysInArrears: number;

  @CreateDateColumn()
  createdAt: Date;

getClassificationDistribution(): { class: string; count: number; percentage: number; amount: number; amountPercentage: number }[] {
  const total = this.totalActiveLoans;
  const totalAmount = this.totalPortfolioValue;
  
  if (total === 0 || totalAmount === 0) return [];

  return Object.entries(this.loanCountByClass).map(([className, count]) => {
    const amount = this.outstandingByClass[className as keyof typeof this.outstandingByClass] || 0;
    return {
      class: className,
      count: count as number,
      percentage: Math.round(((count as number) / total) * 10000) / 100,
      amount: amount as number,
      amountPercentage: Math.round(((amount as number) / totalAmount) * 10000) / 100
    };
  });
}

getProvisionShortfall(): number {
  return Math.max(0, this.totalProvisionsRequired - this.totalProvisionsHeld);
}


isProvisionAdequate(): boolean {
  return this.provisionAdequacyRatio >= 100;
}
getTotalPARAmount(): number {
  const par = this.parBreakdown;
  return (par.par1to30 || 0) + (par.par31to90 || 0) + (par.par90plus || 0);
}

getTotalPARPercentage(): number {
  return this.totalPortfolioValue > 0
    ? (this.getTotalPARAmount() / this.totalPortfolioValue) * 100
    : 0;
}

// New method: Get risk profile summary
getRiskProfile(): {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  primaryConcerns: string[];
  recommendations: string[];
} {
  const concerns: string[] = [];
  const recommendations: string[] = [];

  // Assess PAR risk
  const parRatio = this.totalPARRatio;
  if (parRatio > 15) {
    concerns.push(`High PAR ratio (${parRatio}%)`);
    recommendations.push("Review collection strategies for overdue loans");
  } else if (parRatio > 5) {
    concerns.push(`Moderate PAR ratio (${parRatio}%)`);
    recommendations.push("Monitor watch list loans closely");
  }

  // Assess provision adequacy
  if (this.provisionAdequacyRatio < 80) {
    concerns.push(`Low provision adequacy (${this.provisionAdequacyRatio}%)`);
    recommendations.push("Increase provisions to meet regulatory requirements");
  }

  // Assess collateral coverage
  if (this.collateralCoverageRatio < 80) {
    concerns.push(`Low collateral coverage (${this.collateralCoverageRatio}%)`);
    recommendations.push("Review collateral requirements for new loans");
  }

  // Assess high-risk loans
  const highRiskLoans = (this.loanCountByClass.substandard || 0) + 
                       (this.loanCountByClass.doubtful || 0) + 
                       (this.loanCountByClass.loss || 0);
  
  if (highRiskLoans > this.totalActiveLoans * 0.1) { // More than 10% high risk
    concerns.push(`High proportion of substandard/doubtful/loss loans (${highRiskLoans})`);
    recommendations.push("Implement targeted recovery strategies for high-risk loans");
  }

  // Determine overall risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  
  if (concerns.length >= 3) riskLevel = 'CRITICAL';
  else if (concerns.length >= 2) riskLevel = 'HIGH';
  else if (concerns.length >= 1) riskLevel = 'MEDIUM';

  return {
    riskLevel,
    primaryConcerns: concerns,
    recommendations
  };
}
}