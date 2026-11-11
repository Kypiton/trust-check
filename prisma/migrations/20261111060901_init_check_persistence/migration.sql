-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('TEXT', 'URL', 'SCREENSHOT');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "inputType" "InputType" NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "riskLevel" "RiskLevel",
    "riskScore" INTEGER,
    "confidence" "Confidence",
    "summary" TEXT,
    "signals" JSONB NOT NULL DEFAULT '[]',
    "recommendedActions" JSONB NOT NULL DEFAULT '[]',
    "analysisCoverage" JSONB NOT NULL DEFAULT '[]',
    "analysisNotes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Check_createdAt_idx" ON "Check"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Check_userId_createdAt_idx" ON "Check"("userId", "createdAt" DESC);
