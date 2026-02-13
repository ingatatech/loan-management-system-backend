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

@Entity("individual_shareholders")
@Index(["idPassport", "organization"], { unique: true })
@Index(["email", "organization"], { unique: true })
export class IndividualShareholder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 100 })
  firstname: string;

  @Column({ type: "varchar", length: 100 })
  lastname: string;

  @Column({ type: "varchar", length: 50 })
  idPassport: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  occupation: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string | null;

  @Column("jsonb", { nullable: true })
  physicalAddress: Address | null;

  @Column("jsonb", { nullable: true })
  residentAddress: Address | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  nationality: string | null;

  @Column({ type: "date", nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  gender: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  maritalStatus: string | null;

  @Column({ type: "text", nullable: true })
  idProofDocumentUrl: string | null;

  @Column({ type: "text", nullable: true })
  passportPhotoUrl: string | null;

  @Column({ type: "text", nullable: true })
  proofOfResidenceUrl: string | null;

  @Column("text", { array: true, nullable: true })
  additionalDocuments: string[] | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "boolean", default: false })
  isVerified: boolean;

  @Column({ type: "text", nullable: true })
  verificationNotes: string | null;

  // ======== NEW EXTENDED FIELDS ========
  
  @Column({ type: "varchar", length: 50, nullable: true })
  accountNumber: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  forename2: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  forename3: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  passportNo: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  placeOfBirth: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  postalAddressLine1: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  postalAddressLine2: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  town: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  country: string | null;

  // ======================================

  @ManyToOne(() => Organization, (organization) => organization.individualShareholders, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @Column({ name: "organization_id" })
  organizationId: number;

  @OneToMany(() => ShareCapital, (shareCapital) => shareCapital.individualShareholder, {
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
  getFullName(): string {
    const names = [this.firstname, this.forename2, this.forename3, this.lastname]
      .filter(Boolean);
    return names.join(' ');
  }

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
    return !!(this.idProofDocumentUrl && this.passportPhotoUrl);
  }

  isSameAddress(): boolean {
    if (!this.physicalAddress || !this.residentAddress) return false;
    return JSON.stringify(this.physicalAddress) === JSON.stringify(this.residentAddress);
  }

  getAge(): number | null {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  isEligibleForShares(): boolean {
    const age = this.getAge();
    return !!(age && age >= 18 && this.hasRequiredDocuments() && this.isVerified);
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
}