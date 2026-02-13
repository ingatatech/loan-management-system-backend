import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  ValueTransformer,
} from "typeorm";
import { Organization } from "./Organization";

export enum ManagementPosition {
  CEO = "ceo",
  COO = "coo",
  CFO = "cfo",
  CTO = "cto",
  CMO = "cmo",
  CHRO = "chro", 
  CIO = "cio", 
  HR_MANAGER = "hr_manager",
  OPERATIONS_MANAGER = "operations_manager",
  FINANCE_MANAGER = "finance_manager",
  MARKETING_MANAGER = "marketing_manager",
  GENERAL_MANAGER = "general_manager",
  DEPUTY_MANAGER = "deputy_manager",
  ASSISTANT_MANAGER = "assistant_manager",
  HEAD_OF_DEPARTMENT = "head_of_department",
  SENIOR_MANAGER = "senior_manager",
  OTHER = "other",
}
const ManagementPositionTransformer: ValueTransformer = {
  to: (value: string) => {
    const mapping = {
      "Chief Executive Officer (CEO)": ManagementPosition.CEO,
      "Chief Operating Officer (COO)": ManagementPosition.COO,
      "Chief Financial Officer (CFO)": ManagementPosition.CFO,
      "Chief Technology Officer (CTO)": ManagementPosition.CTO,
      "Chief Marketing Officer (CMO)": ManagementPosition.CMO, // Add this
      "Chief Human Resources Officer (CHRO)": ManagementPosition.CHRO,
      "Chief Information Officer (CIO)": ManagementPosition.CIO,
      "HR Manager": ManagementPosition.HR_MANAGER,
      "Operations Manager": ManagementPosition.OPERATIONS_MANAGER,
      "Finance Manager": ManagementPosition.FINANCE_MANAGER,
      "Marketing Manager": ManagementPosition.MARKETING_MANAGER,
      "General Manager": ManagementPosition.GENERAL_MANAGER,
      "Deputy Manager": ManagementPosition.DEPUTY_MANAGER,
      "Assistant Manager": ManagementPosition.ASSISTANT_MANAGER,
      "Head of Department": ManagementPosition.HEAD_OF_DEPARTMENT,
      "Senior Manager": ManagementPosition.SENIOR_MANAGER,
      "Other": ManagementPosition.OTHER,
    };
    return mapping[value as keyof typeof mapping] || ManagementPosition.OTHER;
  },
  from: (value: ManagementPosition) => {
    const reverseMapping = {
      [ManagementPosition.CEO]: "Chief Executive Officer (CEO)",
      [ManagementPosition.COO]: "Chief Operating Officer (COO)",
      [ManagementPosition.CFO]: "Chief Financial Officer (CFO)",
      [ManagementPosition.CTO]: "Chief Technology Officer (CTO)",
      [ManagementPosition.CMO]: "Chief Marketing Officer (CMO)", // Add this
      [ManagementPosition.CHRO]: "Chief Human Resources Officer (CHRO)",
      [ManagementPosition.CIO]: "Chief Information Officer (CIO)",
      [ManagementPosition.HR_MANAGER]: "HR Manager",
      [ManagementPosition.OPERATIONS_MANAGER]: "Operations Manager",
      [ManagementPosition.FINANCE_MANAGER]: "Finance Manager",
      [ManagementPosition.MARKETING_MANAGER]: "Marketing Manager",
      [ManagementPosition.GENERAL_MANAGER]: "General Manager",
      [ManagementPosition.DEPUTY_MANAGER]: "Deputy Manager",
      [ManagementPosition.ASSISTANT_MANAGER]: "Assistant Manager",
      [ManagementPosition.HEAD_OF_DEPARTMENT]: "Head of Department",
      [ManagementPosition.SENIOR_MANAGER]: "Senior Manager",
      [ManagementPosition.OTHER]: "Other",
    };
    return reverseMapping[value] || "Other";
  },
};

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

interface ExperienceBackground {
  position: string;
  company: string;
  industry: string;
  startDate: Date;
  endDate?: Date;
  isCurrentPosition: boolean;
  keyAchievements: string[];
  responsibilities: string[];
}

interface Qualification {
  degree: string;
  institution: string;
  year: number;
  fieldOfStudy: string;
  certificateUrl?: string;
}

interface PerformanceReview {
  reviewPeriod: string;
  reviewDate: Date;
  overallRating: number; // 1-5 scale
  keyStrengths: string[];
  areasForImprovement: string[];
  goals: string[];
  reviewerName: string;
  reviewDocumentUrl?: string;
}

@Entity("senior_management")
@Index(["email", "organization"], { unique: true })
export class SeniorManagement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({
    type: "enum",
    enum: ManagementPosition,
    default: ManagementPosition.OTHER,
    transformer: ManagementPositionTransformer, 
  })
  position: ManagementPosition;

  @Column({ type: "varchar", length: 255, nullable: true })
  customPosition: string | null;

  @Column("jsonb", { nullable: true })
  experienceBackground: ExperienceBackground[] | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column("jsonb", { nullable: true })
  address: Address | null;

  @Column("jsonb", { nullable: true })
  qualifications: Qualification[] | null;

  @Column({ type: "date", nullable: true })
  joiningDate: Date | null;

  @Column({ type: "date", nullable: true })
  contractStartDate: Date | null;

  @Column({ type: "date", nullable: true })
  contractEndDate: Date | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  employmentType: string | null; // permanent, contract, probation

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  monthlySalary: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  annualSalary: number | null;

  @Column("text", { array: true, nullable: true })
  keyResponsibilities: string[] | null;

  @Column("text", { array: true, nullable: true })
  reportingTo: string[] | null;

  @Column("text", { array: true, nullable: true })
  directReports: string[] | null;

  @Column("jsonb", { nullable: true })
  performanceReviews: PerformanceReview[] | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "text", nullable: true })
  cvDocumentUrl: string | null;

  @Column({ type: "text", nullable: true })
  contractDocumentUrl: string | null;

  @Column({ type: "text", nullable: true })
  idProofDocumentUrl: string | null;

  @Column("text", { array: true, nullable: true })
  qualificationCertificates: string[] | null;

  @Column("text", { array: true, nullable: true })
  additionalDocuments: string[] | null;

  @Column({ type: "text", nullable: true })
  emergencyContactName: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  emergencyContactPhone: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  emergencyContactRelationship: string | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @ManyToOne(() => Organization, (organization) => organization.seniorManagement, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @Column({ name: "organization_id" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Business methods
  getTotalExperienceYears(): number {
    if (!this.experienceBackground || this.experienceBackground.length === 0) return 0;
    
    return this.experienceBackground.reduce((total, exp) => {
      const startDate = new Date(exp.startDate);
      const endDate = exp.endDate ? new Date(exp.endDate) : new Date();
      const diffTime = endDate.getTime() - startDate.getTime();
      const years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
      return total + years;
    }, 0);
  }

  getTenureWithOrganization(): number {
    if (!this.joiningDate) return 0;
    const today = new Date();
    const joining = new Date(this.joiningDate);
    const diffTime = today.getTime() - joining.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
  }

  getDaysUntilContractEnd(): number | null {
    if (!this.contractEndDate) return null;
    const today = new Date();
    const endDate = new Date(this.contractEndDate);
    const diffTime = endDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isContractExpiring(warningDays: number = 90): boolean {
    const daysUntilEnd = this.getDaysUntilContractEnd();
    return daysUntilEnd !== null && daysUntilEnd <= warningDays && daysUntilEnd > 0;
  }

  isContractExpired(): boolean {
    const daysUntilEnd = this.getDaysUntilContractEnd();
    return daysUntilEnd !== null && daysUntilEnd < 0;
  }

  getLatestPerformanceReview(): PerformanceReview | null {
    if (!this.performanceReviews || this.performanceReviews.length === 0) return null;
    
    return this.performanceReviews.reduce((latest, review) => {
      return new Date(review.reviewDate) > new Date(latest.reviewDate) ? review : latest;
    });
  }

  getAveragePerformanceRating(): number {
    if (!this.performanceReviews || this.performanceReviews.length === 0) return 0;
    
    const totalRating = this.performanceReviews.reduce((sum, review) => sum + review.overallRating, 0);
    return totalRating / this.performanceReviews.length;
  }

  getHighestQualification(): Qualification | null {
    if (!this.qualifications || this.qualifications.length === 0) return null;
    
    const qualificationRanking = {
      'PhD': 5,
      'Doctorate': 5,
      'Masters': 4,
      'Bachelors': 3,
      'Diploma': 2,
      'Certificate': 1,
    };
    
    return this.qualifications.reduce((highest, qual) => {
      const currentRank = qualificationRanking[qual.degree as keyof typeof qualificationRanking] || 0;
      const highestRank = qualificationRanking[highest.degree as keyof typeof qualificationRanking] || 0;
      return currentRank > highestRank ? qual : highest;
    });
  }

  hasRequiredDocuments(): boolean {
    return !!(this.cvDocumentUrl && this.idProofDocumentUrl && this.contractDocumentUrl);
  }

  getCurrentPosition(): string {
    return this.position === ManagementPosition.OTHER ? 
           (this.customPosition || 'Other') : 
           this.position.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  addPerformanceReview(review: PerformanceReview): void {
    if (!this.performanceReviews) {
      this.performanceReviews = [];
    }
    this.performanceReviews.push(review);
  }

  addExperience(experience: ExperienceBackground): void {
    if (!this.experienceBackground) {
      this.experienceBackground = [];
    }
    this.experienceBackground.push(experience);
  }

  updateSalary(newSalary: number, isMonthly: boolean = true): void {
    if (isMonthly) {
      this.monthlySalary = newSalary;
      this.annualSalary = newSalary * 12;
    } else {
      this.annualSalary = newSalary;
      this.monthlySalary = newSalary / 12;
    }
  }

  isEligibleForPromotion(): boolean {
    const latestReview = this.getLatestPerformanceReview();
    const averageRating = this.getAveragePerformanceRating();
    const tenure = this.getTenureWithOrganization();
    
    return !!(
      this.isActive &&
      latestReview &&
      averageRating >= 4.0 &&
      tenure >= 1 &&
      this.hasRequiredDocuments()
    );
  }

  needsPerformanceReview(): boolean {
    const latestReview = this.getLatestPerformanceReview();
    if (!latestReview) return true;
    
    const today = new Date();
    const lastReviewDate = new Date(latestReview.reviewDate);
    const monthsSinceLastReview = (today.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    
    return monthsSinceLastReview >= 12; // Annual review cycle
  }

  getDirectReportsCount(): number {
    return this.directReports?.length || 0;
  }

  isInProbationPeriod(): boolean {
    return this.employmentType === 'probation';
  }

  extendContract(additionalMonths: number): void {
    if (this.contractEndDate) {
      const currentEndDate = new Date(this.contractEndDate);
      currentEndDate.setMonth(currentEndDate.getMonth() + additionalMonths);
      this.contractEndDate = currentEndDate;
    }
  }
}