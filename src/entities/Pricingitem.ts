import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";

/**
 * PricingItem — stores the dynamic pricing rows shown on the public homepage.
 * Intentionally simple: only `amount` (display string, e.g. "$200/mo") and
 * `description` (short label).  The system owner manages these from the dashboard.
 */
@Entity("pricing_items")
export class PricingItem {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Human-readable price string shown on the homepage card.
   * Examples: "$200/mo", "$2,000–$10,000", "Custom pricing"
   */
  @Column({ type: "varchar", length: 100 })
  amount: string;

  /**
   * Short description label shown beneath / alongside the amount.
   * Examples: "Basic Plan", "One-Time Implementation", "Enterprise"
   */
  @Column({ type: "varchar", length: 500 })
  description: string;

  /**
   * Controls display order in the homepage pricing section.
   * Lower numbers appear first.
   */
  @Column({ type: "int", default: 0 })
  sortOrder: number;

  /**
   * When false the item is hidden from the public homepage but kept in DB.
   */
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
}