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

export enum DirectorPosition {
  CHAIRPERSON = "chairperson",
  VICE_CHAIRPERSON = "vice_chairperson",
  DIRECTOR = "director",
  INDEPENDENT_DIRECTOR = "independent_director",
  EXECUTIVE_DIRECTOR = "executive_director",
  NON_EXECUTIVE_DIRECTOR = "non_executive_director",
}

const DirectorPositionTransformer: ValueTransformer = {
  to: (value: string) => {
    const mapping = {
      "Chairperson": DirectorPosition.CHAIRPERSON,
      "Vice Chairperson": DirectorPosition.VICE_CHAIRPERSON,
      "Director": DirectorPosition.DIRECTOR,
      "Independent Director": DirectorPosition.INDEPENDENT_DIRECTOR,
      "Executive Director": DirectorPosition.EXECUTIVE_DIRECTOR,
      "Non-Executive Director": DirectorPosition.NON_EXECUTIVE_DIRECTOR,
    };
    return mapping[value as keyof typeof mapping] || value;
  },
  from: (value: DirectorPosition) => {
    const reverseMapping = {
      [DirectorPosition.CHAIRPERSON]: "Chairperson",
      [DirectorPosition.VICE_CHAIRPERSON]: "Vice Chairperson",
      [DirectorPosition.DIRECTOR]: "Director",
      [DirectorPosition.INDEPENDENT_DIRECTOR]: "Independent Director",
      [DirectorPosition.EXECUTIVE_DIRECTOR]: "Executive Director",
      [DirectorPosition.NON_EXECUTIVE_DIRECTOR]: "Non-Executive Director",
    };
    return reverseMapping[value] || value;
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

interface Qualification {
  degree: string;
  institution: string;
  year: number;
  fieldOfStudy: string;
  certificateUrl?: string;
}

interface ProfessionalExperience {
  position: string;
  company: string;
  startDate: Date;
  endDate?: Date;
  isCurrentPosition: boolean;
  responsibilities: string[];
  industry: string;
}

@Entity("board_directors")
@Index(["idPassport", "organization"], { unique: true })
@Index(["email", "organization"], { unique: true })
export class BoardDirector {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({
    type: "enum",
    enum: DirectorPosition,
    default: DirectorPosition.DIRECTOR,
    transformer: DirectorPositionTransformer,
  })
  position: DirectorPosition;

  @Column({ type: "varchar", length: 100 })
  nationality: string;

  @Column({ type: "varchar", length: 50 })
  idPassport: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column("jsonb", { nullable: true })
  address: Address | null;

  @Column("jsonb", { nullable: true })
  qualifications: Qualification[] | null;

  @Column("jsonb", { nullable: true })
  experience: ProfessionalExperience[] | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  currentOccupation: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  currentEmployer: string | null;

  @Column({ type: "date", nullable: true })
  appointmentDate: Date | null;

  @Column({ type: "date", nullable: true })
  termStartDate: Date | null;

  @Column({ type: "date", nullable: true })
  termEndDate: Date | null;

  @Column({ type: "int", default: 3 })
  termLengthYears: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "boolean", default: false })
  isIndependent: boolean;

  @Column({ type: "text", nullable: true })
  idProofDocumentUrl: string | null;

  @Column({ type: "text", nullable: true })
  cvDocumentUrl: string | null;

  @Column({ type: "text", nullable: true })
  appointmentLetterUrl: string | null;

  @Column("text", { array: true, nullable: true })
  qualificationCertificates: string[] | null;

  @Column("text", { array: true, nullable: true })
  additionalDocuments: string[] | null;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  monthlyRemuneration: number | null;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  meetingAllowance: number | null;

  @Column({ type: "int", default: 0 })
  meetingsAttended: number;

  @Column({ type: "int", default: 0 })
  totalMeetings: number;

  @Column({ type: "text", nullable: true })
  specialization: string | null;

  @Column("text", { array: true, nullable: true })
  committees: string[] | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  // ✅ NEW EXTENDED FIELDS (All nullable by default as requested)
  @Column({ type: "varchar", length: 50, nullable: true })
  accountNumber: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  salutation: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  surname: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  forename1: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  forename2: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  forename3: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  nationalIdNumber: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  passportNo: string | null;

  @Column({ type: "date", nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  placeOfBirth: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  postalAddressLine1: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  town: string | null;

  @ManyToOne(() => Organization, (organization) => organization.boardDirectors, {
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

  // ✅ ALL ORIGINAL BUSINESS METHODS MAINTAINED 100%
  getAttendancePercentage(): number {
    return this.totalMeetings > 0 ? (this.meetingsAttended / this.totalMeetings) * 100 : 0;
  }

  getCurrentTenure(): number {
    if (!this.termStartDate) return 0;
    const today = new Date();
    const startDate = new Date(this.termStartDate);
    const diffTime = today.getTime() - startDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
  }

  getDaysUntilTermEnd(): number | null {
    if (!this.termEndDate) return null;
    const today = new Date();
    const endDate = new Date(this.termEndDate);
    const diffTime = endDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isTermExpiring(warningDays: number = 90): boolean {
    const daysUntilEnd = this.getDaysUntilTermEnd();
    return daysUntilEnd !== null && daysUntilEnd <= warningDays && daysUntilEnd > 0;
  }

  isTermExpired(): boolean {
    const daysUntilEnd = this.getDaysUntilTermEnd();
    return daysUntilEnd !== null && daysUntilEnd < 0;
  }

  getTotalExperienceYears(): number {
    if (!this.experience || this.experience.length === 0) return 0;
    
    return this.experience.reduce((total, exp) => {
      const startDate = new Date(exp.startDate);
      const endDate = exp.endDate ? new Date(exp.endDate) : new Date();
      const diffTime = endDate.getTime() - startDate.getTime();
      const years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
      return total + years;
    }, 0);
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
    return !!(this.idProofDocumentUrl && this.cvDocumentUrl && this.appointmentLetterUrl);
  }

  isEligibleForReappointment(): boolean {
    return (
      this.isActive &&
      this.getAttendancePercentage() >= 75 &&
      this.hasRequiredDocuments() &&
      !this.isTermExpired()
    );
  }

  canVote(): boolean {
    return this.isActive && !this.isTermExpired();
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

  addCommittee(committee: string): void {
    if (!this.committees) {
      this.committees = [];
    }
    if (!this.committees.includes(committee)) {
      this.committees.push(committee);
    }
  }

  removeCommittee(committee: string): void {
    if (this.committees) {
      this.committees = this.committees.filter(c => c !== committee);
    }
  }

  updateAttendance(attended: boolean): void {
    this.totalMeetings += 1;
    if (attended) {
      this.meetingsAttended += 1;
    }
  }

  extendTerm(additionalYears: number): void {
    if (this.termEndDate) {
      const currentEndDate = new Date(this.termEndDate);
      currentEndDate.setFullYear(currentEndDate.getFullYear() + additionalYears);
      this.termEndDate = currentEndDate;
      this.termLengthYears += additionalYears;
    }
  }
}