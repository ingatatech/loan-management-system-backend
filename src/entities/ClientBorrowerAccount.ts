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
} from "typeorm";
import { Loan } from "./Loan";
import { BorrowerProfile } from "./BorrowerProfile";
import { Organization } from "./Organization";
import { BorrowerType } from "./BorrowerType";

@Entity("client_borrower_accounts")
@Index(["loanId", "organizationId"], { unique: true })
@Index(["accountNumber"], { unique: true })
export class ClientBorrowerAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  accountNumber: string;

  @Column({ type: "int" })
  loanId: number;

@OneToMany(() => Loan, (loan) => loan.clientAccount, { 
    cascade: ['insert', 'update']  
})
loans: Loan[];

  @Column({ type: "int", nullable: true })
  borrowerId: number | null;

  // ✅ FIXED: Proper enum configuration with separate import
  @Column({
    type: "enum",
    enum: BorrowerType,
    default: BorrowerType.INDIVIDUAL
  })
  borrowerType: BorrowerType;

  // For Individual Borrower
  @Column({ type: "varchar", length: 16, nullable: true })
  nationalId: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  borrowerNames: string | null;

  @Column({ type: "text", nullable: true })
  profilePictureUrl: string | null;

  @Column({ type: "jsonb", nullable: true })
  profileInformation: any | null;

  // For Institution Borrower
  @Column({ type: "varchar", length: 50, nullable: true })
  tinNumber: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  businessNumber: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  institutionName: string | null;

  @Column({ type: "jsonb", nullable: true })
  profileRepresentative: {
    name: string;
    position: string;
    phone: string;
    email: string;
  } | null;

  @Column({ type: "jsonb", nullable: true })
  institutionInformation: any | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Loan)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @ManyToOne(() => BorrowerProfile, { nullable: true })
  @JoinColumn({ name: "borrowerId" })
  borrower: BorrowerProfile | null;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;
}