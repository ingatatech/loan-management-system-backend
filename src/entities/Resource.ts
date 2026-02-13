import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum ResourceType {
  BROCHURE = "brochure",
  GUIDE = "guide",
  WHITEPAPER = "whitepaper",
  IMPLEMENTATION_GUIDE = "implementation_guide",
  ROI_CALCULATOR = "roi_calculator",
  WALKTHROUGH = "walkthrough"
}

@Entity("resources")
@Index(["type"], { unique: true })
export class Resource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "enum",
    enum: ResourceType,
    unique: true
  })
  type: ResourceType;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "varchar", length: 500 })
  fileUrl: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  fileName: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  fileSize: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  pages: string | null;

  @Column({ type: "int", default: 0 })
  downloadCount: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}