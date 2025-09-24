import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { Organization } from "./Organization";
import { ShareCapital } from "./ShareCapital";

interface Address {
  country?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  street?: string;
  houseNumber?: string;
  poBox?: string;
}

interface KeyRepresentative {
  name: string;
  position: string;
  idPassport: string;
  phone?: string;
  email?: string;
  nationality?: string;
  isAuthorizedSignatory: boolean;
}

@Entity("institution_shareholders")
@Index(["tradingLicenseNumber", "organization"], { unique: true })
@Index(["institutionName", "organization"], { unique: true })
export class InstitutionShareholder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  institutionName: string;

  @Column({ type: "varchar", length: 100 })
  tradingLicenseNumber: string;

  @Column({ type: "text", nullable: true })
  businessActivity: string | null;

  @Column("jsonb")
  keyRepresentatives: KeyRepresentative[];

  @Column("jsonb", { nullable: true })
  fullAddress: Address | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  institutionType: string | null;

  @Column({ type: "date", nullable: true })
  incorporationDate: Date | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  registrationNumber: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  tinNumber: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  website: string | null;

  @Column({ type: "text", nullable: true })
  tradingLicenseUrl: string | null;

  @Column({ type: "text", nullable: true })
  certificateOfIncorporationUrl: string | null;

  @Column({ type: "text", nullable: true })
  memorandumOfAssociationUrl: string | null;

  @Column({ type: "text", nullable: true })
  articlesOfAssociationUrl: string | null;

  @Column("text", { array: true, nullable: true })
  additionalDocuments: string[] | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "boolean", default: false })
  isVerified: boolean;

  @Column({ type: "text", nullable: true })
  verificationNotes: string | null;

  @Column({ type: "boolean", default: false })
  isGovernmentEntity: boolean;

  @Column({ type: "boolean", default: false })
  isNonProfit: boolean;

  // ======== NEW EXTENDED FIELDS ========
  
  @Column({ type: "varchar", length: 50, nullable: true })
  accountNumber: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  tradingName: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  companyRegNo: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  postalAddressLine1: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  postalAddressLine2: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  town: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  country: string | null;

  // ======================================

  @ManyToOne(() => Organization, (organization) => organization.institutionShareholders, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @Column({ name: "organization_id" })
  organizationId: number;

  @OneToMany(() => ShareCapital, (shareCapital) => shareCapital.institutionShareholder, {
    cascade: ["remove"],
  })
  shareCapitals: ShareCapital[];

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Business methods
  getTotalSharesValue(): number {
    return this.shareCapitals?.reduce((total, sc) => total + (sc.totalContributedCapitalValue || 0), 0) || 0;
  }

  getTotalSharesCount(): number {
    return this.shareCapitals?.reduce((total, sc) => total + (sc.numberOfShares || 0), 0) || 0;
  }

  getOwnershipPercentage(totalOrganizationCapital: number): number {
    if (totalOrganizationCapital === 0) return 0;
    return (this.getTotalSharesValue() / totalOrganizationCapital) * 100;
  }

  hasRequiredDocuments(): boolean {
    return !!(this.tradingLicenseUrl && this.certificateOfIncorporationUrl);
  }

  getAuthorizedSignatories(): KeyRepresentative[] {
    return this.keyRepresentatives?.filter(rep => rep.isAuthorizedSignatory) || [];
  }

  getPrimaryContact(): KeyRepresentative | null {
    const authorized = this.getAuthorizedSignatories();
    return authorized.length > 0 ? authorized[0] : (this.keyRepresentatives?.[0] || null);
  }

  addKeyRepresentative(representative: KeyRepresentative): void {
    if (!this.keyRepresentatives) {
      this.keyRepresentatives = [];
    }
    this.keyRepresentatives.push(representative);
  }

  removeKeyRepresentative(idPassport: string): void {
    if (this.keyRepresentatives) {
      this.keyRepresentatives = this.keyRepresentatives.filter(rep => rep.idPassport !== idPassport);
    }
  }

  updateKeyRepresentative(idPassport: string, updatedData: Partial<KeyRepresentative>): boolean {
    if (!this.keyRepresentatives) return false;
    
    const index = this.keyRepresentatives.findIndex(rep => rep.idPassport === idPassport);
    if (index !== -1) {
      this.keyRepresentatives[index] = { ...this.keyRepresentatives[index], ...updatedData };
      return true;
    }
    return false;
  }

  isEligibleForShares(): boolean {
    return !!(
      this.hasRequiredDocuments() && 
      this.isVerified && 
      this.keyRepresentatives?.length > 0 &&
      this.getAuthorizedSignatories().length > 0
    );
  }

  getInstitutionAge(): number | null {
    if (!this.incorporationDate) return null;
    const today = new Date();
    const incorporation = new Date(this.incorporationDate);
    return today.getFullYear() - incorporation.getFullYear();
  }

  getCompletePostalAddress(): string {
    const parts = [
      this.postalAddressLine1,
      this.postalAddressLine2,
      this.town,
      this.country
    ].filter(Boolean);
    return parts.join(', ');
  }

  getDisplayName(): string {
    return this.tradingName || this.institutionName;
  }
}