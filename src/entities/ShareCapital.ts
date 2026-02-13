import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
  BeforeInsert,
  BeforeUpdate
} from "typeorm";
import { Organization } from "./Organization";
import { IndividualShareholder } from "./IndividualShareholder";
import { InstitutionShareholder } from "./InstitutionShareholder";
import { ShareCapitalContribution } from "./ShareCapitalContribution";

export enum ShareholderType {
  INDIVIDUAL = "individual",
  INSTITUTION = "institution",
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

  // Aggregated fields
  @Column({ type: "integer", default: 0 })
  totalNumberOfShares: number;

  @Column({ type: "decimal", precision: 20, scale: 2, default: 0 })
  totalContributedCapitalValue: number;

  @Column({ type: "decimal", precision: 20, scale: 2, nullable: true })
  averageValuePerShare: number | null;

  @Column({ type: "integer", default: 0 })
  contributionCount: number;

  @Column({ type: "date", nullable: true })
  firstContributionDate: Date | null;

  @Column({ type: "date", nullable: true })
  lastContributionDate: Date | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "text", nullable: true })
  notes: string | null;

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

  @OneToMany(() => ShareCapitalContribution, (contribution) => contribution.shareCapital, {
    cascade: true,
    eager: false,
  })
  contributions: ShareCapitalContribution[];

  

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
  validateAndRoundValues() {
    this.totalNumberOfShares = Math.floor(Number(this.totalNumberOfShares) || 0);
    this.totalContributedCapitalValue = Number(Number(this.totalContributedCapitalValue).toFixed(2));
    if (this.averageValuePerShare !== null) {
      this.averageValuePerShare = Number(Number(this.averageValuePerShare).toFixed(2));
    }
    this.contributionCount = Math.floor(Number(this.contributionCount) || 0);
  }

addContribution(
  numberOfShares: number,
  valuePerShare: number,
  contributionDate: Date,
  shareType: string,
  paymentDetails: any,
  notes?: string | null,
  recordedBy?: number | null,
  recordedByName?: string | null
): ShareCapitalContribution {
  console.log('ShareCapital.addContribution called with:', {
    numberOfShares,
    valuePerShare,
    contributionDate,
    shareType,
    currentTotalShares: this.totalNumberOfShares,
    currentTotalValue: this.totalContributedCapitalValue
  });

  const contribution = new ShareCapitalContribution();
  
  // Set the shareCapitalId (but don't set the relation to avoid cascade issues)
  contribution.shareCapitalId = this.id;
  
  // Set other properties
  contribution.contributionDate = contributionDate;
  contribution.shareType = shareType as any;
  contribution.numberOfShares = numberOfShares;
  contribution.valuePerShare = valuePerShare;
  contribution.paymentDetails = paymentDetails;
  contribution.notes = notes || null;
  contribution.recordedBy = recordedBy || null;
  contribution.recordedByName = recordedByName || null;
  
  // Calculate total value
  contribution.calculateTotalValue();

  // Update aggregated totals
  const currentShares = Number(this.totalNumberOfShares) || 0;
  const currentValue = Number(this.totalContributedCapitalValue) || 0;
  const newValue = Number(numberOfShares) * Number(valuePerShare);
  
  this.totalNumberOfShares = currentShares + Number(numberOfShares);
  this.totalContributedCapitalValue = Number((currentValue + newValue).toFixed(2));
  
  this.averageValuePerShare = this.totalNumberOfShares > 0 
    ? Number((this.totalContributedCapitalValue / this.totalNumberOfShares).toFixed(2))
    : null;
  
  this.contributionCount = (Number(this.contributionCount) || 0) + 1;
  this.lastContributionDate = contributionDate;
  
  if (!this.firstContributionDate) {
    this.firstContributionDate = contributionDate;
  }

  console.log('ShareCapital.addContribution completed:', {
    contributionShareCapitalId: contribution.shareCapitalId,
    newTotalShares: this.totalNumberOfShares,
    newTotalValue: this.totalContributedCapitalValue,
    newContributionCount: this.contributionCount
  });

  return contribution;
}
  getContributions(): ShareCapitalContribution[] {
    if (!this.contributions) return [];
    return [...this.contributions].sort((a, b) => 
      new Date(b.contributionDate).getTime() - new Date(a.contributionDate).getTime()
    );
  }

  // Get shareholder name
  getShareholderName(): string {
    if (this.shareholderType === ShareholderType.INDIVIDUAL && this.individualShareholder) {
      return `${this.individualShareholder.firstname} ${this.individualShareholder.lastname}`;
    }
    if (this.shareholderType === ShareholderType.INSTITUTION && this.institutionShareholder) {
      return this.institutionShareholder.institutionName;
    }
    return "Unknown Shareholder";
  }

  // Get ownership percentage
  getOwnershipPercentage(totalOrganizationCapital: number): number {
    if (totalOrganizationCapital === 0) return 0;
    return (Number(this.totalContributedCapitalValue) / totalOrganizationCapital) * 100;
  }

  // Safe version of the object for JSON responses (prevents circular structure)
  toJSON() {
    const { contributions, ...rest } = this;
    return {
      ...rest,
      contributionCount: this.contributionCount,
      contributions: contributions?.map(c => c.toJSON ? c.toJSON() : c) || []
    };
  }
}