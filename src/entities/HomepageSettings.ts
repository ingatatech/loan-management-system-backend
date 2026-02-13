import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("homepage_settings")
export class HomepageSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50 })
  phone: string;

  @Column({ type: "varchar", length: 255 })
  salesEmail: string;

  @Column({ type: "varchar", length: 255 })
  officeAddress: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  city: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  country: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  workingHours: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}