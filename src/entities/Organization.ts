// @ts-nocheck
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  DeleteDateColumn,
  Index,
} from "typeorm";
import { User } from "./User";
import { Category } from "./Category";
import { Service } from "./Service";
import { IndividualShareholder } from "./IndividualShareholder";
import { InstitutionShareholder } from "./InstitutionShareholder";
import { ShareCapital } from "./ShareCapital";
import { Borrowing } from "./Borrowing";
import { GrantedFunds } from "./GrantedFunds";
import { OperationalFunds } from "./OperationalFunds";
import { BoardDirector } from "./BoardDirector";
import { SeniorManagement } from "./SeniorManagement";
import { Loan } from "./Loan";
import { BorrowerProfile } from "./BorrowerProfile";
import { Guarantor } from "./Guarantor";
import { BouncedCheque } from "./BouncedCheque";
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

@Entity("organizations")
@Index(["name"], { unique: true })
export class Organization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255, unique: true })
  name: string;

  @Column("text", { type: "json", nullable: true })
  selectedCategories: string[] | null;


  @Column("jsonb", { nullable: true })
  address: Address | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  tinNumber: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  website: string | null;

  @Column({ type: "text", nullable: true })
  logoUrl: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  registrationNumber: string | null;

  @Column({ type: "date", nullable: true })
  registrationDate: Date | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  businessSector: string | null;
  @OneToMany(() => Guarantor, (guarantor) => guarantor.organization, {
    cascade: ["remove"],
  })
  guarantors: Guarantor[];
  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt: Date | null;

  // Relationships
  @OneToMany(() => User, (user) => user.organization, {
    cascade: ["remove"],
  })
  users: User[];

  @OneToMany(() => Category, (category) => category.organization, {
    cascade: ["remove"],
  })
  categories: Category[];

  @OneToMany(() => Service, (service) => service.organization, {
    cascade: ["remove"],
  })
  services: Service[];

  @OneToMany(() => IndividualShareholder, (shareholder) => shareholder.organization, {
    cascade: ["remove"],
  })
  individualShareholders: IndividualShareholder[];

  @OneToMany(() => InstitutionShareholder, (shareholder) => shareholder.organization, {
    cascade: ["remove"],
  })
  institutionShareholders: InstitutionShareholder[];

  @OneToMany(() => BorrowerProfile, (borrower_profiles) => borrower_profiles.organization, {
    cascade: ["remove"],
  })
  borrowerProfiles: BorrowerProfile[];

   @OneToMany(() => BouncedCheque, (bounced_cheques) => bounced_cheques.organization, {
    cascade: ["remove"],
  })
  bouncedCheques: BouncedCheque[];


  @OneToMany(() => ShareCapital, (shareCapital) => shareCapital.organization, {
    cascade: ["remove"],
  })
  shareCapitals: ShareCapital[];


  @OneToMany(() => Loan, (loans) => loans.organization, {
    cascade: ["remove"],
  })
  loans: Loan[];

  @OneToMany(() => Borrowing, (borrowing) => borrowing.organization, {
    cascade: ["remove"],
  })
  borrowings: Borrowing[];

  @OneToMany(() => GrantedFunds, (grantedFunds) => grantedFunds.organization, {
    cascade: ["remove"],
  })
  grantedFunds: GrantedFunds[];

  @OneToMany(() => OperationalFunds, (operationalFunds) => operationalFunds.organization, {
    cascade: ["remove"],
  })
  operationalFunds: OperationalFunds[];

  @OneToMany(() => BoardDirector, (director) => director.organization, {
    cascade: ["remove"],
  })
  boardDirectors: BoardDirector[];

  @OneToMany(() => SeniorManagement, (management) => management.organization, {
    cascade: ["remove"],
  })
  seniorManagement: SeniorManagement[];

  // Business methods
  getTotalShareholders(): number {
    return (this.individualShareholders?.length || 0) + (this.institutionShareholders?.length || 0);
  }

  getTotalShareCapital(): number {
    return this.shareCapitals?.reduce((total, sc) => total + (sc.totalContributedCapitalValue || 0), 0) || 0;
  }

  getTotalBorrowings(): number {
    return this.borrowings?.reduce((total, b) => total + (b.amountBorrowed || 0), 0) || 0;
  }

  getTotalGrants(): number {
    return this.grantedFunds?.reduce((total, g) => total + (g.amountGranted || 0), 0) || 0;
  }

  isValidForLoanApplication(): boolean {
    const hasMinShareholders = this.getTotalShareholders() >= 1;
    const hasMinShareCapital = this.getTotalShareCapital() > 0;
    const hasMinDirectors = (this.boardDirectors?.length || 0) >= 1;
    const hasManagement = (this.seniorManagement?.length || 0) >= 1;

    return hasMinShareholders && hasMinShareCapital && hasMinDirectors && hasManagement;
  }
}