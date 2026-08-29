/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_deletedAt_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "deletedAt";
