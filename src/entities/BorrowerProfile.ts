// @ts-nocheck
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from "typeorm";
import { Organization } from "./Organization";
import { Loan } from "./Loan";
import { Guarantor } from "./Guarantor";
import { BouncedCheque } from "./BouncedCheque";

export interface Address {
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  country?: string;
  province?: string;
  street?: string;
  houseNumber?: string;
  poBox?: string;
  postalLine1?: string;
  postalLine2?: string;
  postalCode?: string;
  physicalLine1?: string;
  physicalLine2?: string;
  physicalPostalCode?: string;
  plotNumber?: string;
  residenceType?: string;
}

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other"
}

export enum MaritalStatus {
  SINGLE = "single",
  MARRIED = "married",
  DIVORCED = "divorced",
  WIDOWED = "widowed"
}

export enum RelationshipType {
  STAFF = "staff",
  DIRECTOR = "director",
  SHAREHOLDER = "shareholder",
  NONE = "none",
  NEW_BORROWER = "new_borrower",
  REPEAT_BORROWER = "repeat_borrower",
  RETURNING_BORROWER = "returning_borrower"
}

export interface BorrowerDocument {
  documentType: string;
  documentUrl: string;
  uploadedAt: Date;
  uploadedBy: number;
}

export interface OccupationSupportingDocument {
  documentType: string;
  documentUrl: string;
  description: string; 
  fileName: string;    
  uploadedAt: string; 
  uploadedBy: number;
}

// ✅ NEW: Parents Information Interface
export interface ParentsInformation {
  motherFullName: string;
  fatherFullName: string;
}

@Entity("borrower_profiles")
@Index(["organizationId", "nationalId"], { unique: true })
@Index(["organizationId", "borrowerId"], { unique: true })
export class BorrowerProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  borrowerId: string;

  // ORIGINAL FIELDS - 100% MAINTAINED
  @Column({ type: "varchar", length: 100 })
  firstName: string;

  @Column({ type: "varchar", length: 100 })
  lastName: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  middleName: string | null;

  get fullName(): string {
    return this.middleName
      ? `${this.firstName} ${this.middleName} ${this.lastName}`
      : `${this.firstName} ${this.lastName}`;
  }

  @Column({ type: "varchar", length: 16, nullable: true })
  nationalId: string;

  // ✅ NEW: National ID Provision Location
  @Column({ type: "varchar", length: 100, nullable: true })
  nationalIdDistrict: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  nationalIdSector: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  primaryPhone: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  alternativePhone: string | null;

  @Column({
    type: "enum",
    enum: Gender
  })
  gender: Gender;

  @Column({
    type: "enum",
    enum: RelationshipType,
    default: RelationshipType.NONE
  })
  relationshipWithNDFSP: RelationshipType;

  @Column({
    type: "enum",
    enum: MaritalStatus
  })
  maritalStatus: MaritalStatus;

  @Column({ type: "int", default: 0 })
  previousLoansPaidOnTime: number;

  @Column({ type: "text", nullable: true })
  defaultLoanPurpose: string | null;

  @Column({ type: "date", nullable: true })
  dateOfBirth: Date;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  placeOfBirth: string | null;

  @Column({ type: "jsonb" })
  address: Address;

  // ✅ NEW: Parents Information
  @Column({ type: "jsonb", nullable: true })
  parentsInformation: ParentsInformation | null;

  // ✅ NEW: Borrower Documents Array
  @Column({ type: "jsonb", nullable: true })
  borrowerDocuments: BorrowerDocument[] | null;

@Column({ type: "jsonb", nullable: true })
occupationSupportingDocuments: OccupationSupportingDocument[] | null;

  @OneToMany(() => Guarantor, (guarantor) => guarantor.borrower, {
    cascade: ["remove"],
  })
  guarantors: Guarantor[];

  @OneToMany(() => BouncedCheque, (bouncedCheques) => bouncedCheques.loan, {
    cascade: ["remove"],
  })
  bouncedCheques: BouncedCheque[];

  @Column({ type: "varchar", length: 100, nullable: true })
  occupation: string | null;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  monthlyIncome: number | null;

  @Column({ type: "text", nullable: true })
  incomeSource: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ============ EXTENDED FIELDS - ALL NULL BY DEFAULT ============
  // Personal Details Extensions
  @Column({ type: 'varchar', length: 20, nullable: true })
  salutation: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  forename2: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  forename3: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  passportNo: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nationality: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  taxNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  drivingLicenseNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  socialSecurityNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  healthInsuranceNumber: string | null;

  @Column({ type: 'int', nullable: true })
  dependantsCount: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  placeOfBirth: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  spouseFirstName: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  spouseLastName: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  spouseNationalId: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  spousePhone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  spouseEmail: string | null;

  // Document URLs
  @Column({ type: "text", nullable: true })
  marriageCertificateUrls: string | null;

  @Column({ type: "text", nullable: true })
  spouseCrbReportUrls: string | null;

  @Column({ type: "text", nullable: true })
  witnessCrbReportUrls: string | null;

  @Column({ type: "text", nullable: true })
  borrowerCrbReportUrls: string | null;
  
  @Column({ type: 'varchar', length: 20, nullable: true })
  workPhone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  homePhone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fax: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  employerName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  employerAddress1: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  employerAddress2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  employerTown: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  employerCountry: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  incomeFrequency: string | null;

  // Group & Account Details
  @Column({ type: 'varchar', length: 100, nullable: true })
  groupName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  groupNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  accountNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  oldAccountNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  accountType: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  accountStatus: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  classification: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  accountOwner: string | null;

  @Column({ type: 'jsonb', nullable: true })
  jointLoanParticipants: string[] | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currencyType: string | null;

  @Column({ type: 'date', nullable: true })
  dateOpened: Date | null;

  @Column({ type: 'int', nullable: true })
  termsDuration: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  repaymentTerm: string | null;

  // Financial & Loan Information
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  creditLimit: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  currentBalance: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  availableCredit: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  currentBalanceIndicator: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  scheduledMonthlyPayment: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  actualPaymentAmount: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amountPastDue: number | null;

  @Column({ type: 'int', nullable: true })
  installmentsInArrears: number | null;

  @Column({ type: 'int', nullable: true })
  daysInArrears: number | null;

  @Column({ type: 'date', nullable: true })
  dateClosed: Date | null;

  @Column({ type: 'date', nullable: true })
  lastPaymentDate: Date | null;

  @Column({ type: 'float', nullable: true })
  interestRate: number | null;

  @Column({ type: 'date', nullable: true })
  firstPaymentDate: Date | null;

  // Additional Categorization
  @Column({ type: 'varchar', length: 50, nullable: true })
  nature: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sectorOfActivity: string | null;

  @Column({ type: 'date', nullable: true })
  approvalDate: Date | null;

  @Column({ type: 'date', nullable: true })
  finalPaymentDate: Date | null;

  // ORIGINAL RELATIONSHIPS - 100% MAINTAINED
  @ManyToOne(() => Organization, (organization) => organization.borrowerProfiles)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @OneToMany(() => Loan, (loan) => loan.borrower, {
    cascade: ["remove"],
  })
  loans: Loan[];

  // ORIGINAL COMPUTED PROPERTIES - 100% MAINTAINED
  get age(): number {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  isEligibleForLoan(): boolean {
    return this.isActive && this.age >= 18 && this.age <= 100;
  }

  getCreditScore(): number {
    const baseScore = 500;
    const paidLoansBonus = this.previousLoansPaidOnTime * 50;
    const relationshipBonus = [
      RelationshipType.STAFF,
      RelationshipType.DIRECTOR,
      RelationshipType.SHAREHOLDER
    ].includes(this.relationshipWithNDFSP) ? 100 : 0;

    return Math.min(850, baseScore + paidLoansBonus + relationshipBonus);
  }

  isValidPhoneFormat(phone: string): boolean {
    return /^\+?[1-9]\d{1,14}$/.test(phone);
  }

  isValidNationalId(): boolean {
    return /^\d{16}$/.test(this.nationalId);
  }

  getTable2_1_Data(): Record<string, any> {
    return {
      no: this.id,
      namesOfBorrowers: this.fullName,
      idOfTheBorrower: this.nationalId,
      telephoneNumber: this.primaryPhone,
      gender: this.gender,
      relationshipWithNDFSP: this.relationshipWithNDFSP,
      maritalStatus: this.maritalStatus,
      previousLoansPaidOnTime: this.previousLoansPaidOnTime > 0,
      purposeOfTheLoan: this.defaultLoanPurpose || ''
    };
  }

  getLocationDetails(): Record<string, any> {
    return {
      district: this.address.district || '',
      sector: this.address.sector || '',
      cell: this.address.cell || '',
      village: this.address.village || ''
    };
  }

  // ✅ NEW: Helper method to get borrower documents
  getBorrowerDocumentsList(): BorrowerDocument[] {
    return this.borrowerDocuments || [];
  }

  // ✅ NEW: Add borrower document
  addBorrowerDocument(documentType: string, documentUrl: string, uploadedBy: number): void {
    const document: BorrowerDocument = {
      documentType,
      documentUrl,
      uploadedAt: new Date(),
      uploadedBy
    };

    if (!this.borrowerDocuments) {
      this.borrowerDocuments = [];
    }

    this.borrowerDocuments.push(document);
  }

  // ✅ NEW: Get parents information
  getParentsInfo(): ParentsInformation | null {
    return this.parentsInformation;
  }

addOccupationSupportingDocument(
  documentType: string, 
  documentUrl: string, 
  description: string,
  fileName: string,
  uploadedBy: number
): void {
  const document: OccupationSupportingDocument = {
    documentType,
    documentUrl,
    description,
    fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy
  };

  if (!this.occupationSupportingDocuments) {
    this.occupationSupportingDocuments = [];
  }

  this.occupationSupportingDocuments.push(document);
}



  // ✅ NEW: Get occupation supporting documents
  getOccupationSupportingDocuments(): occupationSupportingDocuments[] {
    return this.occupationSupportingDocuments || [];
  }
}

// ORIGINAL INTERFACE - 100% MAINTAINED
export interface BorrowerProfileData {
  firstName: string;
  lastName: string;
  middleName?: string;
  nationalId: string;
  gender: Gender;
  dateOfBirth: Date;
  maritalStatus: MaritalStatus;
  primaryPhone: string;
  alternativePhone?: string;
  email?: string;
  relationshipWithNDFSP?: RelationshipType;
  previousLoansPaidOnTime?: number;
  address: Address;
  occupation?: string;
  monthlyIncome?: number;
  incomeSource?: string;
  notes?: string;
  // ✅ NEW: Enhanced fields
  nationalIdDistrict?: string;
  nationalIdSector?: string;
  parentsInformation?: ParentsInformation;
  borrowerDocuments?: BorrowerDocument[];
  placeOfBirth?: string;
}

// NEW INTERFACE FOR EXTENDED DATA
export interface ExtendedBorrowerData {
  // Personal Details
  salutation?: string;
  forename2?: string;
  forename3?: string;
  passportNo?: string;
  nationality?: string;
  taxNumber?: string;
  drivingLicenseNumber?: string;
  socialSecurityNumber?: string;
  healthInsuranceNumber?: string;
  dependantsCount?: number;
  placeOfBirth?: string;

  // Contact & Employment
  workPhone?: string;
  homePhone?: string;
  fax?: string;
  employerName?: string;
  employerAddress1?: string;
  employerAddress2?: string;
  employerTown?: string;
  employerCountry?: string;
  incomeFrequency?: string;

  // Group & Account
  groupName?: string;
  groupNumber?: string;
  accountNumber?: string;
  oldAccountNumber?: string;
  accountType?: string;
  accountStatus?: string;
  classification?: string;
  accountOwner?: string;
  jointLoanParticipants?: string[];
  currencyType?: string;
  dateOpened?: Date;
  termsDuration?: number;
  repaymentTerm?: string;

  // Financial
  creditLimit?: number;
  currentBalance?: number;
  availableCredit?: number;
  currentBalanceIndicator?: string;
  scheduledMonthlyPayment?: number;
  actualPaymentAmount?: number;
  amountPastDue?: number;
  installmentsInArrears?: number;
  daysInArrears?: number;
  dateClosed?: Date;
  lastPaymentDate?: Date;
  interestRate?: number;
  firstPaymentDate?: Date;

  // Categorization
  nature?: string;
  category?: string;
  sectorOfActivity?: string;
  approvalDate?: Date;
  finalPaymentDate?: Date;
}