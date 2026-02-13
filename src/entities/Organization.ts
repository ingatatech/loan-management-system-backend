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
import { Account } from "./Account";
import { Transaction } from "./Transaction";

interface Branch {
  title: string;
}

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

  @OneToMany(() => Account, (account) => account.organization, {
  cascade: ["remove"],
})
accounts: Account[];

@OneToMany(() => Transaction, (transaction) => transaction.organization, {
  cascade: ["remove"],
})
transactions: Transaction[];

  @Column({ type: "jsonb", nullable: true })
  branches: Branch[] | null;
  
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



  
getAccountCountByType(accountType: string): number {
  if (!this.accounts) return 0;
  return this.accounts.filter(a => a.accountType === accountType && a.isActive).length;
}

/**
 * Get total transactions
 */
getTotalTransactions(): number {
  return this.transactions?.length || 0;
}

/**
 * Get total posted transactions
 */
getTotalPostedTransactions(): number {
  if (!this.transactions) return 0;
  return this.transactions.filter(t => t.status === "posted" || t.status === "approved").length;
}

/**
 * Get account structure summary
 */
getAccountStructureSummary(): {
  totalAccounts: number;
  assets: number;
  liabilities: number;
  capital: number;
  revenue: number;
  expenses: number;
  activeAccounts: number;
} {
  const activeAccounts = this.accounts?.filter(a => a.isActive) || [];
  
  return {
    totalAccounts: this.accounts?.length || 0,
    assets: activeAccounts.filter(a => a.accountType === "asset").length,
    liabilities: activeAccounts.filter(a => a.accountType === "liability").length,
    capital: activeAccounts.filter(a => a.accountType === "capital").length,
    revenue: activeAccounts.filter(a => a.accountType === "revenue").length,
    expenses: activeAccounts.filter(a => a.accountType === "expense").length,
    activeAccounts: activeAccounts.length
  };
}

/**
 * Check if organization has bookkeeping setup
 */
hasBookkeepingSetup(): boolean {
  const summary = this.getAccountStructureSummary();
  
  // Basic requirement: At least one account in each major category
  return summary.assets > 0 && 
         summary.liabilities > 0 && 
         summary.capital > 0 && 
         summary.revenue > 0 && 
         summary.expenses > 0;
}

/**
 * Get bookkeeping readiness status
 */
getBookkeepingReadinessStatus(): {
  isReady: boolean;
  missingCategories: string[];
  recommendations: string[];
} {
  const summary = this.getAccountStructureSummary();
  const missingCategories: string[] = [];
  const recommendations: string[] = [];

  if (summary.assets === 0) {
    missingCategories.push("Assets");
    recommendations.push("Create asset accounts (e.g., Cash, Bank, Fixed Assets)");
  }

  if (summary.liabilities === 0) {
    missingCategories.push("Liabilities");
    recommendations.push("Create liability accounts (e.g., Accounts Payable, Loans)");
  }

  if (summary.capital === 0) {
    missingCategories.push("Capital");
    recommendations.push("Create capital accounts (e.g., Share Capital, Retained Earnings)");
  }

  if (summary.revenue === 0) {
    missingCategories.push("Revenue");
    recommendations.push("Create revenue accounts (e.g., Sales Revenue, Service Income)");
  }

  if (summary.expenses === 0) {
    missingCategories.push("Expenses");
    recommendations.push("Create expense accounts (e.g., Salaries, Rent, Utilities)");
  }

  return {
    isReady: missingCategories.length === 0,
    missingCategories,
    recommendations
  };
}
}

